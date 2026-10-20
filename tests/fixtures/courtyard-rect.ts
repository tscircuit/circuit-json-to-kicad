import { expect } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { type Footprint, KicadPcb, Xy } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import fixture from "../assets/repro-courtyard-rect-rotation-color.circuit.json"

export type Point = { x: number; y: number }
export type CourtyardLayer = "top" | "bottom"

export function convertCourtyardRect(
  layer: CourtyardLayer,
  rotation: number,
  color?: string,
  options: { componentRotation?: number; courtyardOffset?: Point } = {},
) {
  const circuitJson = structuredClone(fixture) as CircuitJson
  const component = circuitJson.find((e) => e.type === "pcb_component")!
  component.layer = layer
  component.rotation = options.componentRotation ?? 0
  const courtyard = circuitJson.find((e) => e.type === "pcb_courtyard_rect")!
  courtyard.layer = layer
  courtyard.ccw_rotation = rotation
  courtyard.color = color
  courtyard.center.x += options.courtyardOffset?.x ?? 0
  courtyard.center.y += options.courtyardOffset?.y ?? 0

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  // Inspect the serialized board, not just the converter's in-memory objects.
  const pcb = KicadPcb.parse(converter.getOutputString())[0] as KicadPcb
  expect(pcb.footprints).toHaveLength(1)
  expect(pcb.footprints[0]!.layer?.names).toEqual([
    layer === "top" ? "F.Cu" : "B.Cu",
  ])
  return pcb.footprints[0]!
}

export function getCourtyardGraphics(
  footprint: Footprint,
  layer: CourtyardLayer,
) {
  const kicadLayer = layer === "top" ? "F.CrtYd" : "B.CrtYd"
  return [
    ...footprint.fpRects,
    ...footprint.fpPolys,
    ...footprint.fpLines,
  ].filter((graphic) => graphic.layer?.names.includes(kicadLayer))
}

export function normalizePoints(points: Point[]) {
  return [
    ...new Set(points.map(({ x, y }) => `${x.toFixed(6)},${y.toFixed(6)}`)),
  ].sort()
}

export function getCourtyardPoints(
  footprint: Footprint,
  layer: CourtyardLayer,
) {
  const points: Point[] = []
  for (const graphic of getCourtyardGraphics(footprint, layer)) {
    if (graphic.token === "fp_rect" && "start" in graphic && "end" in graphic) {
      const { start, end } = graphic
      expect(start).toBeDefined()
      expect(end).toBeDefined()
      points.push(start!, { x: start!.x, y: end!.y }, end!, {
        x: end!.x,
        y: start!.y,
      })
    } else if ("points" in graphic) {
      points.push(
        ...(graphic.points?.points.filter((p) => p instanceof Xy) ?? []),
      )
    } else if ("start" in graphic && "end" in graphic) {
      points.push(graphic.start!, graphic.end!)
    }
  }
  return points
}

export function getCourtyardCorners(
  footprint: Footprint,
  layer: CourtyardLayer,
) {
  return normalizePoints(getCourtyardPoints(footprint, layer))
}
