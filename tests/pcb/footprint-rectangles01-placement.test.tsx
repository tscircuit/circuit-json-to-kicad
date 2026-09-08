import { expect, test } from "bun:test"
import { parseKicadPcb } from "kicadts"
import { Circuit } from "tscircuit-latest"
import {
  applyToPoint,
  compose,
  rotateDEG,
  translate,
} from "transformation-matrix"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../fixtures/stackCircuitJsonKicadPngs"

test("footprint rectangles retain world corners and layers under rotation", async () => {
  const circuit = new Circuit()
  const kinds = ["courtyard", "fabrication", "note"] as const
  const layers = ["top", "bottom"] as const
  const rotations = [0, 45, 90, 270]
  circuit.add(
    <board width={76} height={78} routingDisabled>
      {kinds.flatMap((kind, kindIndex) =>
        layers.flatMap((layer, layerIndex) =>
          rotations.map((rotation, column) => (
            <chip
              name={`U${kindIndex * 8 + layerIndex * 4 + column + 1}`}
              key={`${kind}-${layer}-${rotation}`}
              pcbX={-27 + column * 18}
              pcbY={31 - (kindIndex * 2 + layerIndex) * 12}
              pcbRotation={rotation}
              layer={layer}
              footprint={
                <footprint>
                  <smtpad shape="rect" width={1} height={1} portHints={["1"]} />
                  {kind === "courtyard" ? (
                    <courtyardrect
                      pcbX={2}
                      pcbY={1.5}
                      width={5}
                      height={2}
                      pcbRotation={15}
                      layer={layer}
                    />
                  ) : kind === "fabrication" ? (
                    <fabricationnoterect
                      pcbX={2}
                      pcbY={1.5}
                      width={5}
                      height={2}
                      layer={layer}
                      strokeWidth={0.12}
                      hasStroke
                    />
                  ) : (
                    <pcbnoterect
                      pcbX={2}
                      pcbY={1.5}
                      width={5}
                      height={2}
                      layer={layer}
                      strokeWidth={0.18}
                    />
                  )}
                  <courtyardoutline
                    outline={[
                      { x: -3, y: -2 },
                      { x: -2, y: -2 },
                      { x: -3, y: -1 },
                    ]}
                    layer={layer}
                  />
                </footprint>
              }
            />
          )),
        ),
      )}
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const rectangles = circuitJson.filter(
    (e) =>
      e.type === "pcb_courtyard_rect" ||
      e.type === "pcb_fabrication_note_rect" ||
      e.type === "pcb_note_rect",
  )
  expect(rectangles).toHaveLength(24)
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const outputString = converter.getOutputString()
  const pcb = parseKicadPcb(outputString)
  expect(pcb.footprints).toHaveLength(24)
  for (const source of rectangles) {
    const component = circuitJson.find(
      (e) =>
        e.type === "pcb_component" &&
        e.pcb_component_id === source.pcb_component_id,
    )
    if (!component || component.type !== "pcb_component")
      throw new Error("Missing rectangle owner")
    const footprint = pcb.footprints.find(
      (f) =>
        Math.abs(f.position!.x - (100 + component.center.x)) < 0.0001 &&
        Math.abs(f.position!.y - (100 - component.center.y)) < 0.0001,
    )!
    const polygons = footprint.fpPolys.filter(
      (p) => p.points?.points.length === 4,
    )
    const graphics = [...footprint.fpRects, ...polygons]
    expect(graphics).toHaveLength(1)
    // Existing courtyard polygons must survive alongside rotated rectangles.
    expect(
      footprint.fpPolys.filter((p) => p.points?.points.length === 3),
    ).toHaveLength(1)
    const graphic = graphics[0]!
    const side = source.layer === "bottom" ? "B" : "F"
    expect(graphic.layer?.names).toEqual([
      `${side}.${source.type === "pcb_courtyard_rect" ? "CrtYd" : "Fab"}`,
    ])
    expect(graphic.stroke?.width).toBeCloseTo(
      source.type === "pcb_courtyard_rect" ? 0.05 : source.stroke_width,
    )
    const localCorners =
      "start" in graphic
        ? [
            { x: graphic.start!.x, y: graphic.start!.y },
            { x: graphic.end!.x, y: graphic.start!.y },
            { x: graphic.end!.x, y: graphic.end!.y },
            { x: graphic.start!.x, y: graphic.end!.y },
          ]
        : graphic.points!.points
    const footprintAngle =
      "angle" in footprint.position! ? (footprint.position.angle ?? 0) : 0
    const localToBoard = compose(
      translate(footprint.position!.x, footprint.position!.y),
      rotateDEG(-footprintAngle),
    )
    const actualCorners = localCorners.map((point) => {
      if (!("x" in point && "y" in point))
        throw new Error("Unexpected arc in rectangle")
      return applyToPoint(localToBoard, { x: point.x, y: point.y })
    })
    const sourceAngle =
      "ccw_rotation" in source
        ? (source.ccw_rotation ?? component.rotation)
        : component.rotation
    const sourceToBoard = compose(
      translate(source.center.x, source.center.y),
      rotateDEG(sourceAngle),
    )
    for (const corner of [
      { x: -source.width / 2, y: -source.height / 2 },
      { x: source.width / 2, y: -source.height / 2 },
      { x: source.width / 2, y: source.height / 2 },
      { x: -source.width / 2, y: source.height / 2 },
    ]) {
      const expected = applyToPoint(sourceToBoard, corner)
      expect(
        actualCorners.some(
          (actual) =>
            Math.abs(actual.x - (100 + expected.x)) < 0.0001 &&
            Math.abs(actual.y - (100 - expected.y)) < 0.0001,
        ),
      ).toBe(true)
    }
  }
  const snapshot = await takeKicadSnapshot({
    kicadFileContent: outputString,
    kicadFileType: "pcb",
  })
  await expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
      snapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 31_000)
