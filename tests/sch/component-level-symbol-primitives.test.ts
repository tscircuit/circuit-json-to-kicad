import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"

test("component-level KiCad artwork is preserved without generic symbol overlays", () => {
  const circuitJson = [
    {
      type: "source_component",
      source_component_id: "source_component_1",
      name: "Device:R",
      ftype: "simple_resistor",
      manufacturer_part_number: "10k",
    },
    {
      type: "schematic_component",
      schematic_component_id: "schematic_component_1",
      source_component_id: "source_component_1",
      center: { x: 0, y: 0 },
      size: { width: 2, height: 1 },
      is_box_with_pins: false,
    },
    {
      type: "schematic_path",
      schematic_path_id: "schematic_path_1",
      schematic_component_id: "schematic_component_1",
      points: [
        { x: -1, y: -0.5 },
        { x: 1, y: -0.5 },
        { x: 0, y: 0.5 },
        { x: -1, y: -0.5 },
      ],
      is_filled: true,
      fill_color: "rgb(255, 255, 194)",
      is_dashed: false,
    },
    {
      type: "source_component",
      source_component_id: "source_component_2",
      name: "Device:R",
      ftype: "simple_resistor",
      manufacturer_part_number: "10k",
    },
    {
      type: "schematic_component",
      schematic_component_id: "schematic_component_2",
      source_component_id: "source_component_2",
      center: { x: 5, y: 0 },
      size: { width: 1, height: 2 },
      is_box_with_pins: false,
    },
    {
      type: "schematic_path",
      schematic_path_id: "schematic_path_2",
      schematic_component_id: "schematic_component_2",
      points: [
        { x: 4.5, y: -1 },
        { x: 5.5, y: -1 },
        { x: 5, y: 1 },
        { x: 4.5, y: -1 },
      ],
      is_filled: true,
      fill_color: "rgb(255, 255, 194)",
      is_dashed: false,
    },
    {
      type: "schematic_text",
      schematic_text_id: "schematic_text_1",
      text: "R1",
      position: { x: 0, y: 0.8 },
      font_size: 0.1,
      rotation: 0,
      anchor: "center",
      color: "rgb(132, 0, 0)",
    },
    {
      type: "schematic_rect",
      schematic_rect_id: "schematic_rect_1",
      center: { x: 2.5, y: 0 },
      width: 8,
      height: 4,
      rotation: 0,
      stroke_width: 0.05,
      color: "rgb(0, 0, 132)",
      is_filled: false,
      is_dashed: true,
    },
    {
      type: "schematic_path",
      schematic_path_id: "schematic_path_3",
      points: [
        { x: -1.5, y: 1.5 },
        { x: 6.5, y: 1.5 },
      ],
      stroke_width: 0.05,
      stroke_color: "rgb(0, 0, 132)",
      is_filled: false,
      is_dashed: true,
    },
  ] as any

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const schematic = parseKicadSch(converter.getOutputString())

  expect(
    schematic.libSymbols?.symbols.map(({ libraryId }) => libraryId),
  ).toEqual([
    "Device:R_10k_schematic_component_1",
    "Device:R_10k_schematic_component_2",
  ])
  expect(schematic.symbols.map(({ libraryId }) => libraryId)).toEqual([
    "Device:R_10k_schematic_component_1",
    "Device:R_10k_schematic_component_2",
  ])
  expect(
    schematic.libSymbols?.symbols.every(
      (symbol) => symbol.pinNames?.hide && symbol.pinNumbers?.hide,
    ),
  ).toBe(true)
  expect(converter.getOutputString()).toContain("(color 255 255 194 1)")

  expect(schematic.texts).toHaveLength(1)
  expect(schematic.texts[0]?.effects?.font?.size).toEqual({
    width: 1.5,
    height: 1.5,
  })
  expect(schematic.texts[0]?.effects?.font?.color).toEqual({
    r: 132,
    g: 0,
    b: 0,
    a: 1,
  })
  expect(schematic.rectangles).toHaveLength(1)
  expect(schematic.rectangles[0]?.stroke?.color).toEqual({
    r: 0,
    g: 0,
    b: 132,
    a: 1,
  })
  expect(schematic.polylines).toHaveLength(1)
  expect(schematic.polylines[0]?.stroke?.type).toBe("dash")
})

test("component-level source geometry determines the schematic paper size", () => {
  const circuitJson = [
    {
      type: "source_component",
      source_component_id: "source_component_1",
      name: "asymmetric-multi-unit-symbol",
      ftype: "simple_chip",
    },
    {
      type: "schematic_component",
      schematic_component_id: "schematic_component_1",
      source_component_id: "source_component_1",
      center: { x: 0, y: 0 },
      // A KiCad unit's anchor may be near one end of the body. Treating this
      // size as centered would incorrectly require an A2 sheet.
      size: { width: 20, height: 18 },
      is_box_with_pins: false,
    },
    {
      type: "schematic_path",
      schematic_path_id: "schematic_path_1",
      schematic_component_id: "schematic_component_1",
      points: [
        { x: -10, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: -16 },
        { x: -10, y: -16 },
        { x: -10, y: 0 },
      ],
      is_filled: false,
      is_dashed: false,
    },
  ] satisfies CircuitJson

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const schematic = parseKicadSch(converter.getOutputString())
  expect(schematic.paper?.size).toBe("A3")
})
