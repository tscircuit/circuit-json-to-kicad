import { expect, test } from "bun:test"
import { su } from "@tscircuit/circuit-json-util"
import type { CircuitJson } from "circuit-json"
import { createGenericChipSymbolData } from "lib/schematic/stages/symbols-stage-converters/createGenericChipSymbolData"
import { createDrawingSubsymbol } from "lib/schematic/stages/symbols-stage-converters/createDrawingSubsymbol"

test("box artwork shares the component origin and excludes other components and field text", () => {
  const component = {
    type: "schematic_component",
    schematic_component_id: "component1",
    center: { x: 5, y: 7 },
    size: { width: 4, height: 2 },
    is_box_with_pins: true,
  } as const
  const circuitJson = [
    component,
    {
      type: "schematic_path",
      schematic_path_id: "path1",
      schematic_component_id: "component1",
      points: [
        { x: 4, y: 7 },
        { x: 5, y: 7.5 },
        { x: 6, y: 7 },
        { x: 4, y: 7 },
      ],
      is_filled: true,
      is_dashed: false,
      fill_color: "#840000",
      stroke_width: 0.02,
    },
    {
      type: "schematic_circle",
      schematic_circle_id: "circle1",
      schematic_component_id: "component1",
      center: { x: 5.5, y: 6.5 },
      radius: 0.1,
      is_filled: true,
      is_dashed: false,
      fill_color: "#840000",
      color: "#840000",
      stroke_width: 0.02,
    },
    {
      type: "schematic_text",
      schematic_text_id: "text1",
      schematic_component_id: "component1",
      text: "U1",
      position: { x: 3, y: 9 },
      font_size: 0.2,
      anchor: "left",
      rotation: 0,
      color: "#006464",
    },
    {
      type: "schematic_path",
      schematic_path_id: "path2",
      schematic_component_id: "component2",
      points: [
        { x: 10, y: 10 },
        { x: 11, y: 11 },
      ],
      is_filled: false,
      is_dashed: false,
    },
  ] satisfies CircuitJson

  const symbolData = createGenericChipSymbolData(component, su(circuitJson))
  const drawing = createDrawingSubsymbol({
    libId: "Custom:box",
    symbolData,
    isChip: true,
    c2kMatSchScale: 10,
  })

  expect(drawing.polylines).toHaveLength(2)
  expect(drawing.circles).toHaveLength(1)
  expect(drawing.texts).toHaveLength(0)
  const box = drawing.polylines[0]!.getString()
  expect(box).toContain("(xy -20 -10)")
  expect(box).toContain("(xy 20 10)")
  expect(box).toContain("(type background)")
  const artwork = drawing.polylines[1]!.getString()
  expect(artwork).toContain("(xy -10 0)")
  expect(artwork).toContain("(xy 0 5)")
  expect(artwork).toContain("(color 132 0 0 1)")
  expect(artwork).toContain("(width 0.2)")
  const circle = drawing.circles[0]!.getString()
  expect(circle).toContain("(center 5 -5)")
  expect(circle).toContain("(color 132 0 0 1)")
  expect(circle).toContain("(width 0.2)")
})
