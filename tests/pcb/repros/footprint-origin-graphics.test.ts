import { expect, test } from "bun:test"
import type {
  CircuitJson,
  PcbFabricationNoteRect,
  PcbNoteRect,
  Point,
} from "circuit-json"
import { KicadPcb, Xy } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import {
  applyToPoint,
  compose,
  rotateDEG,
  translate,
} from "transformation-matrix"
import fixture from "../../assets/footprint-origin-graphics.circuit.json"

function normalizeCorners(points: Point[]) {
  return points
    .map(({ x, y }) => [Number(x.toFixed(6)), Number(y.toFixed(6))])
    .sort(([ax, ay], [bx, by]) => ax! - bx! || ay! - by!)
}

function getBoardRectCorners(rect: PcbNoteRect | PcbFabricationNoteRect) {
  return [
    { x: rect.center.x - rect.width / 2, y: rect.center.y - rect.height / 2 },
    { x: rect.center.x + rect.width / 2, y: rect.center.y - rect.height / 2 },
    { x: rect.center.x + rect.width / 2, y: rect.center.y + rect.height / 2 },
    { x: rect.center.x - rect.width / 2, y: rect.center.y + rect.height / 2 },
  ]
}

function expectGraphicsStayInBoardSpace(circuitJson: CircuitJson) {
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = KicadPcb.parse(converter.getOutputString())[0] as KicadPcb
  const components = circuitJson.filter(
    (element) => element.type === "pcb_component",
  )
  const standaloneSolderPasteCount = circuitJson.filter(
    (element) =>
      element.type === "pcb_solder_paste" &&
      !element.pcb_component_id &&
      !element.pcb_smtpad_id,
  ).length
  expect(output.footprints).toHaveLength(
    components.length + standaloneSolderPasteCount,
  )
  const componentFootprints = output.footprints.filter(
    (footprint) => !footprint.libraryLink?.startsWith("tscircuit:solderpaste_"),
  )
  expect(componentFootprints).toHaveLength(components.length)

  for (const [componentIndex, component] of components.entries()) {
    const footprint = componentFootprints[componentIndex]!
    const position = footprint.position!
    const ccwRotationDegrees = "angle" in position ? (position.angle ?? 0) : 0
    // KiCad places footprint-local points on its PCB in mm (+X right, +Y down).
    // Its positive footprint angle turns local points counterclockwise visually.
    const footprintToKicadBoardTransform = compose(
      translate(position.x, position.y),
      rotateDEG(-ccwRotationDegrees),
    )
    const sourceCircle = circuitJson
      .filter((element) => element.type === "pcb_courtyard_circle")
      .find((circle) => circle.pcb_component_id === component.pcb_component_id)!
    expect(footprint.fpCircles).toHaveLength(1)
    const circle = footprint.fpCircles[0]!
    const actualCenter = applyToPoint(
      footprintToKicadBoardTransform,
      circle.center!,
    )
    const expectedCenter = applyToPoint(
      converter.ctx.c2kMatPcb!,
      sourceCircle.center,
    )
    expect(actualCenter.x).toBeCloseTo(expectedCenter.x, 6)
    expect(actualCenter.y).toBeCloseTo(expectedCenter.y, 6)
    expect(circle.layer?.names).toEqual([
      sourceCircle.layer === "bottom" ? "B.CrtYd" : "F.CrtYd",
    ])
    expect(
      Math.hypot(
        circle.end!.x - circle.center!.x,
        circle.end!.y - circle.center!.y,
      ),
    ).toBeCloseTo(sourceCircle.radius)

    const sourceRects = circuitJson
      .filter(
        (element) =>
          element.type === "pcb_note_rect" ||
          element.type === "pcb_fabrication_note_rect",
      )
      .filter((rect) => rect.pcb_component_id === component.pcb_component_id)
    const expectedCorners = sourceRects
      .map((rect) =>
        JSON.stringify(
          normalizeCorners(
            getBoardRectCorners(rect).map((point) =>
              applyToPoint(converter.ctx.c2kMatPcb!, point),
            ),
          ),
        ),
      )
      .sort()
    const actualCorners = [
      ...footprint.fpRects.map((rect) => [
        rect.start!,
        { x: rect.end!.x, y: rect.start!.y },
        rect.end!,
        { x: rect.start!.x, y: rect.end!.y },
      ]),
      ...footprint.fpPolys.map((polygon) =>
        polygon.points!.points.filter(
          (point): point is Xy => point instanceof Xy,
        ),
      ),
    ]
      .map((corners) =>
        JSON.stringify(
          normalizeCorners(
            corners.map((point) =>
              applyToPoint(footprintToKicadBoardTransform, point),
            ),
          ),
        ),
      )
      .sort()
    expect(sourceRects).toHaveLength(2)
    expect(actualCorners).toEqual(expectedCorners)
  }
}

test("footprint graphics retain their emitted board geometry with authored and legacy origins", () => {
  const circuitJson = structuredClone(fixture) as CircuitJson
  expectGraphicsStayInBoardSpace(circuitJson)
  for (const element of circuitJson) {
    if (element.type === "pcb_component") delete element.footprint_origin
  }
  expectGraphicsStayInBoardSpace(circuitJson)
})
