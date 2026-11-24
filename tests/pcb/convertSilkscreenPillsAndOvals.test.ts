import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { KicadPcb } from "kicadts"
import {
  CircuitJsonToKicadModConverter,
  CircuitJsonToKicadPcbConverter,
} from "lib"

const getXyBounds = (points: Array<{ x: number; y: number }>) => {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return {
    spanX: Math.max(...xs) - Math.min(...xs),
    spanY: Math.max(...ys) - Math.min(...ys),
    centerX: (Math.min(...xs) + Math.max(...xs)) / 2,
    centerY: (Math.min(...ys) + Math.max(...ys)) / 2,
  }
}

test("exports component-owned and standalone silkscreen pills and ovals with rotation and layer mapping", () => {
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
      center: { x: 4, y: 2 },
      width: 4,
      height: 4,
      layer: "top",
      rotation: 90,
      obstructs_within_bounds: true,
    },
    {
      type: "pcb_silkscreen_pill",
      pcb_silkscreen_pill_id: "pill_comp",
      pcb_component_id: "pc1",
      center: { x: 5, y: 2 },
      width: 3,
      height: 1,
      ccw_rotation: 90,
      layer: "top",
    },
    {
      type: "pcb_silkscreen_oval",
      pcb_silkscreen_oval_id: "oval_comp",
      pcb_component_id: "pc1",
      center: { x: 4, y: 3 },
      radius_x: 2,
      radius_y: 0.8,
      ccw_rotation: 0,
      layer: "bottom",
    },
    {
      type: "pcb_silkscreen_pill",
      pcb_silkscreen_pill_id: "pill_board",
      pcb_component_id: "",
      center: { x: -3, y: 1 },
      width: 4,
      height: 1.2,
      ccw_rotation: 90,
      layer: "top",
    },
    {
      type: "pcb_silkscreen_oval",
      pcb_silkscreen_oval_id: "oval_board",
      pcb_component_id: "",
      center: { x: -2, y: -3 },
      radius_x: 2.5,
      radius_y: 1,
      ccw_rotation: 90,
      layer: "bottom",
    },
  ]

  const pcbConverter = new CircuitJsonToKicadPcbConverter(circuitJson)
  pcbConverter.runUntilFinished()
  const serialized = pcbConverter.getOutputString()
  const parsed = KicadPcb.parse(serialized)[0] as KicadPcb

  // Component footprint has 2 fp_poly elements (1 pill on F.SilkS, 1 oval on B.SilkS)
  const footprint = parsed.footprints[0]!
  expect(footprint).toBeDefined()
  expect(footprint.fpPolys).toHaveLength(2)

  const compPill = footprint.fpPolys.find((p) =>
    p.layer?.names.includes("F.SilkS"),
  )!
  const compOval = footprint.fpPolys.find((p) =>
    p.layer?.names.includes("B.SilkS"),
  )!
  expect(compPill).toBeDefined()
  expect(compOval).toBeDefined()
  expect(compPill.stroke?.width).toBe(0.1)
  expect(compPill.fill?.filled).toBe(false)
  expect(compOval.stroke?.width).toBe(0.1)
  expect(compOval.fill?.filled).toBe(false)

  // Component rotated 90 deg CCW around (4, 2); pill at (5, 2) with ccw_rotation=90:
  // In footprint-local coords: relative board offset (+1, 0) -> (0, 1) after scale(1,-1) + rotate(90),
  // and pill's 90-deg board axis aligns with horizontal local axis (spanX=3, spanY=1).
  const compPillPts = (compPill.points?.points ?? []).map((pt: any) => ({
    x: pt.x,
    y: pt.y,
  }))
  const compPillBounds = getXyBounds(compPillPts)
  expect(compPillBounds.centerX).toBeCloseTo(0, 5)
  expect(compPillBounds.centerY).toBeCloseTo(1, 5)
  expect(compPillBounds.spanX).toBeCloseTo(3, 5)
  expect(compPillBounds.spanY).toBeCloseTo(1, 5)

  // Standalone board-level graphics have 2 gr_poly elements (1 pill on F.SilkS, 1 oval on B.SilkS)
  expect(parsed.graphicPolys).toHaveLength(2)
  const boardPill = parsed.graphicPolys.find((p) =>
    p.layer?.names.includes("F.SilkS"),
  )!
  const boardOval = parsed.graphicPolys.find((p) =>
    p.layer?.names.includes("B.SilkS"),
  )!
  expect(boardPill).toBeDefined()
  expect(boardOval).toBeDefined()

  const boardPillBounds = getXyBounds(
    (boardPill.points?.points ?? []).map((pt: any) => ({ x: pt.x, y: pt.y })),
  )
  expect(boardPillBounds.spanX).toBeCloseTo(1.2, 5)
  expect(boardPillBounds.spanY).toBeCloseTo(4, 5)

  const boardOvalBounds = getXyBounds(
    (boardOval.points?.points ?? []).map((pt: any) => ({ x: pt.x, y: pt.y })),
  )
  expect(boardOvalBounds.spanX).toBeCloseTo(2, 5)
  expect(boardOvalBounds.spanY).toBeCloseTo(5, 5)

  // Also verify .kicad_mod footprint export preserves component-owned silkscreen pills & ovals
  const modConverter = new CircuitJsonToKicadModConverter(circuitJson)
  modConverter.runUntilFinished()
  const modString = modConverter.getOutputString()
  expect(modString).toContain("(fp_poly")
  expect(modString).toContain("F.SilkS")
  expect(modString).toContain("B.SilkS")
})
