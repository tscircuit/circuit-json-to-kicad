import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { KicadPcb } from "kicadts"
import {
  CircuitJsonToKicadModConverter,
  CircuitJsonToKicadPcbConverter,
} from "lib"

test("exports pcb_courtyard_polygon and pcb_courtyard_pill with footprint rotation, layer, and stroke color", () => {
  const circuitJson: CircuitJson = [
    {
      type: "pcb_board",
      pcb_board_id: "pcb_board_1",
      center: { x: 0, y: 0 },
      width: 20,
      height: 20,
      thickness: 1.6,
      num_layers: 2,
      material: "fr4",
    },
    {
      type: "source_component",
      source_component_id: "sc1",
      name: "U1",
      ftype: "simple_chip",
    },
    {
      type: "pcb_component",
      pcb_component_id: "pc1",
      source_component_id: "sc1",
      center: { x: 10, y: 20 },
      width: 4,
      height: 4,
      layer: "top",
      rotation: 90,
      obstructs_within_bounds: true,
    },
    {
      type: "pcb_courtyard_polygon",
      pcb_courtyard_polygon_id: "cpoly1",
      pcb_component_id: "pc1",
      layer: "top",
      color: "#ff3366",
      points: [
        { x: 9, y: 18 },
        { x: 12, y: 18 },
        { x: 12, y: 21 },
        { x: 10, y: 23 },
        { x: 9, y: 21 },
        { x: 9, y: 18 },
      ],
    },
    {
      type: "pcb_courtyard_pill",
      pcb_courtyard_pill_id: "cpill1",
      pcb_component_id: "pc1",
      center: { x: 11, y: 20 },
      width: 4,
      height: 1.6,
      radius: 0.8,
      layer: "bottom",
      color: "#3366ff",
    },
  ]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const serialized = converter.getOutputString()
  const parsed = KicadPcb.parse(serialized)[0] as KicadPcb

  const footprint = parsed.footprints[0]!
  expect(footprint).toBeDefined()
  expect(footprint.fpPolys).toHaveLength(2)

  const topPoly = footprint.fpPolys.find((p) =>
    p.layer?.names.includes("F.CrtYd"),
  )!
  const bottomPill = footprint.fpPolys.find((p) =>
    p.layer?.names.includes("B.CrtYd"),
  )!

  expect(topPoly).toBeDefined()
  expect(topPoly.stroke?.width).toBe(0.05)
  expect(topPoly.stroke?.color).toEqual({ r: 255, g: 51, b: 102, a: 1 })
  expect(topPoly.fill?.filled).toBe(false)
  // Duplicate closing point (9, 18) is deduplicated -> 5 distinct vertices
  const polyPts = (topPoly.points?.points ?? []).map((pt: any) => ({
    x: pt.x,
    y: pt.y,
  }))
  expect(polyPts).toHaveLength(5)
  // First vertex (9, 18) relative to (10, 20) is (-1, -2); scale(1,-1) -> (-1, 2); rotate(90) -> (-2, -1)
  expect(polyPts[0]!.x).toBeCloseTo(-2, 5)
  expect(polyPts[0]!.y).toBeCloseTo(-1, 5)

  expect(bottomPill).toBeDefined()
  expect(bottomPill.stroke?.width).toBe(0.05)
  expect(bottomPill.stroke?.color).toEqual({ r: 51, g: 102, b: 255, a: 1 })
  expect(bottomPill.fill?.filled).toBe(false)

  const pillPts = (bottomPill.points?.points ?? []).map((pt: any) => ({
    x: pt.x,
    y: pt.y,
  }))
  const pillXs = pillPts.map((p) => p.x)
  const pillYs = pillPts.map((p) => p.y)
  // Pill at (11, 20) relative to (10, 20) rotated 90 deg CCW -> local center (0, 1), spanX=1.6, spanY=4
  expect((Math.min(...pillXs) + Math.max(...pillXs)) / 2).toBeCloseTo(0, 5)
  expect((Math.min(...pillYs) + Math.max(...pillYs)) / 2).toBeCloseTo(1, 5)
  expect(Math.max(...pillXs) - Math.min(...pillXs)).toBeCloseTo(1.6, 5)
  expect(Math.max(...pillYs) - Math.min(...pillYs)).toBeCloseTo(4, 5)

  // Verify .kicad_mod export also includes both courtyard shapes
  const modConverter = new CircuitJsonToKicadModConverter(circuitJson)
  modConverter.runUntilFinished()
  const modString = modConverter.getOutputString()
  expect(modString).toContain("F.CrtYd")
  expect(modString).toContain("B.CrtYd")
  expect(modString).toContain("(color 255 51 102 1)")
  expect(modString).toContain("(color 51 102 255 1)")
})
