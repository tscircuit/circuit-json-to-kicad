import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "../../lib"
import { selectSchematicPaperSize } from "../../lib/schematic/selectSchematicPaperSize"

test("selectSchematicPaperSize(800, 1100) selects portrait A0 so 840x1140mm content with margins fits without clipping", () => {
  const paper = selectSchematicPaperSize(800, 1100)
  expect(paper).toEqual({
    name: "A0",
    width: 841,
    height: 1189,
    isPortrait: true,
  })
  expect(paper.width).toBeGreaterThanOrEqual(800 + 2 * 20)
  expect(paper.height).toBeGreaterThanOrEqual(1100 + 2 * 20)
})

test("selectSchematicPaperSize falls back to custom User sheet when content exceeds A0 in both orientations", () => {
  const paper = selectSchematicPaperSize(1200, 900)
  expect(paper).toEqual({
    name: "User",
    width: 1240,
    height: 940,
    customSize: {
      width: 1240,
      height: 940,
    },
  })
})

test("CircuitJsonToKicadSchConverter keeps tall single-sheet schematic within serialized paper bounds", () => {
  const converter = new CircuitJsonToKicadSchConverter([
    {
      type: "schematic_component",
      schematic_component_id: "sch_top",
      source_component_id: "src_top",
      center: { x: -26, y: 36 },
      size: { width: 1.2, height: 1.2 },
    } as any,
    {
      type: "schematic_component",
      schematic_component_id: "sch_bottom",
      source_component_id: "src_bottom",
      center: { x: 26, y: -36 },
      size: { width: 1.2, height: 1.2 },
    } as any,
    {
      type: "schematic_box",
      schematic_component_id: "sch_top",
      x: -26.6,
      y: 35.4,
      width: 1.2,
      height: 1.2,
      is_dashed: false,
    } as any,
    {
      type: "schematic_box",
      schematic_component_id: "sch_bottom",
      x: 25.4,
      y: -36.6,
      width: 1.2,
      height: 1.2,
      is_dashed: false,
    } as any,
  ])
  converter.runUntilFinished()

  const sch = parseKicadSch(converter.getOutputString())
  expect(sch.paper?.size).toBe("A0")
  expect(sch.paper?.isPortrait).toBe(true)

  const sheetWidth = 841
  const sheetHeight = 1189
  for (const sym of sch.symbols) {
    const x = sym.at?.x ?? 0
    const y = sym.at?.y ?? 0
    expect(x).toBeGreaterThanOrEqual(20)
    expect(x).toBeLessThanOrEqual(sheetWidth - 20)
    expect(y).toBeGreaterThanOrEqual(20)
    expect(y).toBeLessThanOrEqual(sheetHeight - 20)
  }
})
