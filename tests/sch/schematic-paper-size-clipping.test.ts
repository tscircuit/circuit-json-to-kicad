import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { parseKicadSch } from "kicadts"
import {
  assertSchematicWithinBounds,
  checkSchematicWithinBounds,
} from "../../lib/schematic/assertSchematicWithinBounds"
import { CircuitJsonToKicadSchConverter } from "../../lib/schematic/CircuitJsonToKicadSchConverter"
import { selectSchematicPaperSize } from "../../lib/schematic/selectSchematicPaperSize"

test("selectSchematicPaperSize(800, 1100) selects A0 portrait without clipping (Issue #557)", () => {
  const paper = selectSchematicPaperSize(800, 1100)

  // With 20mm padding on each side, requires 840 mm width and 1140 mm height.
  // Standard A0 landscape (1189 x 841) would clip height at 841 mm.
  // A0 portrait (841 x 1189) safely accommodates 840 x 1140 mm.
  expect(paper.name).toBe("A0")
  expect(paper.width).toBe(841)
  expect(paper.height).toBe(1189)
  expect(paper.isPortrait).toBe(true)
})

test("selectSchematicPaperSize selects custom sheet for content exceeding A0 in both orientations", () => {
  const paper = selectSchematicPaperSize(1200, 1500)

  // Requires 1240 x 1540 mm, which exceeds A0 in both landscape (1189 x 841) and portrait (841 x 1189).
  expect(paper.name).toBe("Custom")
  expect(paper.width).toBe(1240)
  expect(paper.height).toBe(1540)
  expect(paper.customSize).toEqual({ width: 1240, height: 1540 })
  expect(paper.isPortrait).toBe(true)
})

test("selectSchematicPaperSize preserves standard landscape sizes when content fits", () => {
  const small = selectSchematicPaperSize(100, 80)
  expect(small.name).toBe("A4")
  expect(small.width).toBe(297)
  expect(small.height).toBe(210)
  expect(small.isPortrait).toBeUndefined()

  const medium = selectSchematicPaperSize(350, 240)
  expect(medium.name).toBe("A3")
  expect(medium.width).toBe(420)
  expect(medium.height).toBe(297)
  expect(medium.isPortrait).toBeUndefined()
})

test("CircuitJsonToKicadSchConverter exports tall schematic on A0 portrait with assertWithinBounds passing", () => {
  // Tall schematic spanning 50mm width x 70mm height in Circuit JSON coordinates.
  // Multiplied by DEFAULT_SCHEMATIC_SCALE_FACTOR (15):
  // 50 * 15 = 750 mm width, 70 * 15 = 1050 mm height.
  // Including default padding, requires 790 mm x 1090 mm, fitting A0 portrait (841 x 1189 mm).
  const circuitJson: CircuitJson = [
    { type: "source_component", source_component_id: "U_TOP", name: "U_TOP" },
    {
      type: "schematic_component",
      schematic_component_id: "U_TOP_sch",
      source_component_id: "U_TOP",
      center: { x: 0, y: 35 },
    },
    { type: "source_component", source_component_id: "U_BOT", name: "U_BOT" },
    {
      type: "schematic_component",
      schematic_component_id: "U_BOT_sch",
      source_component_id: "U_BOT",
      center: { x: 0, y: -35 },
    },
    {
      type: "schematic_trace",
      schematic_trace_id: "t_vertical",
      edges: [{ from: { x: 0, y: 35 }, to: { x: 0, y: -35 } }],
      junctions: [],
    },
  ]

  const converter = new CircuitJsonToKicadSchConverter(circuitJson, {
    assertWithinBounds: true,
  })
  converter.runUntilFinished()

  const outputString = converter.getOutputString()
  const parsed = parseKicadSch(outputString)

  expect(parsed.paper?.size).toBe("A0")
  expect(parsed.paper?.isPortrait).toBe(true)

  // Verify elements are strictly within paper boundaries
  const boundsResult = checkSchematicWithinBounds(parsed)
  expect(boundsResult.isWithinBounds).toBe(true)
  expect(boundsResult.violations).toHaveLength(0)
  expect(boundsResult.paperWidth).toBe(841)
  expect(boundsResult.paperHeight).toBe(1189)

  // Explicit bounds assertion call passes without throwing
  expect(() => assertSchematicWithinBounds(parsed)).not.toThrow()
})

test("assertSchematicWithinBounds throws explicit diagnostic when elements exceed paper boundaries", () => {
  // Construct a small A4 schematic and artificially place an element outside the 297 x 210 mm sheet
  const circuitJson: CircuitJson = [
    { type: "source_component", source_component_id: "R1", name: "R1" },
    {
      type: "schematic_component",
      schematic_component_id: "R1_sch",
      source_component_id: "R1",
      center: { x: 0, y: 0 },
    },
  ]

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const sch = parseKicadSch(converter.getOutputString())

  // Valid conversion initially passes bounds check
  expect(() => assertSchematicWithinBounds(sch)).not.toThrow()

  // Introduce an out-of-bounds symbol coordinate (e.g. y = 350 on A4 landscape 297x210)
  if (sch.symbols?.[0]?.at) {
    sch.symbols[0].at.y = 350
  }

  const result = checkSchematicWithinBounds(sch)
  expect(result.isWithinBounds).toBe(false)
  expect(result.violations.length).toBeGreaterThanOrEqual(1)
  expect(result.violations[0]?.message).toContain("exceeds sheet boundary")

  expect(() => assertSchematicWithinBounds(sch)).toThrowError(
    /exceeds paper sheet bounds/,
  )
})
