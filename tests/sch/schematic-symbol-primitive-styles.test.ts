import { expect, test } from "bun:test"
import {
  schematic_arc,
  schematic_circle,
  schematic_line,
  schematic_path,
  schematic_rect,
} from "circuit-json"
import { getSchematicSymbolData } from "lib/schematic/getSchematicSymbolData"
import { buildSymbolDataFromSchematicPrimitives } from "lib/schematic/stages/symbols-stage-converters/buildSymbolDataFromSchematicPrimitives"
import { createDrawingSubsymbol } from "lib/schematic/stages/symbols-stage-converters/createDrawingSubsymbol"

test("custom symbol circles, lines, and paths preserve dashed stroke styles", () => {
  const circle = schematic_circle.parse({
    schematic_symbol_id: "sym_dashed",
    type: "schematic_circle",
    center: { x: 1, y: 2 },
    radius: 0.5,
    stroke_width: 0.1,
    is_dashed: true,
    is_filled: false,
  })
  const line = schematic_line.parse({
    schematic_symbol_id: "sym_dashed",
    type: "schematic_line",
    x1: 0,
    y1: 2,
    x2: 2,
    y2: 2,
    stroke_width: 0.1,
    is_dashed: true,
  })
  const path = schematic_path.parse({
    schematic_symbol_id: "sym_dashed",
    type: "schematic_path",
    points: [
      { x: 0, y: 1 },
      { x: 1, y: 3 },
      { x: 2, y: 1 },
    ],
    stroke_width: 0.1,
    is_dashed: true,
    is_filled: false,
  })

  const symbolData = buildSymbolDataFromSchematicPrimitives({
    circuitJson: [circle, line, path],
    schematicSymbolId: "sym_dashed",
    schematicSymbol: { center: { x: 1, y: 2 } },
  })
  const drawing = createDrawingSubsymbol({
    libId: "Custom:dashed_symbol",
    symbolData,
    isChip: false,
    c2kMatSchScale: 2,
  })

  expect(drawing.circles).toHaveLength(1)
  expect(drawing.circles[0]?.getString()).toContain("(type dash)")
  expect(drawing.polylines).toHaveLength(2)
  for (const polyline of drawing.polylines) {
    expect(polyline.stroke?.type).toBe("dash")
  }
})

test("custom symbol primitives filter out transparent unfilled sizing markers", () => {
  const transparentCircle = schematic_circle.parse({
    schematic_symbol_id: "sym_markers",
    type: "schematic_circle",
    center: { x: 0, y: 0 },
    radius: 0.25,
    color: "transparent",
    is_filled: false,
  })
  const transparentLine = schematic_line.parse({
    schematic_symbol_id: "sym_markers",
    type: "schematic_line",
    x1: -1,
    y1: -1,
    x2: 1,
    y2: 1,
    color: "rgba(0, 0, 0, 0)",
  })
  const transparentPath = schematic_path.parse({
    schematic_symbol_id: "sym_markers",
    type: "schematic_path",
    points: [
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    ],
    stroke_color: "transparent",
    is_filled: false,
  })
  const transparentArc = schematic_arc.parse({
    schematic_symbol_id: "sym_markers",
    type: "schematic_arc",
    center: { x: 0, y: 0 },
    radius: 0.5,
    start_angle_degrees: 0,
    end_angle_degrees: 90,
    color: "transparent",
  })
  const transparentRect = schematic_rect.parse({
    schematic_symbol_id: "sym_markers",
    type: "schematic_rect",
    center: { x: 0, y: 0 },
    width: 2,
    height: 1,
    rotation: 0,
    color: "transparent",
    is_filled: false,
  })
  const visibleCircle = schematic_circle.parse({
    schematic_symbol_id: "sym_markers",
    type: "schematic_circle",
    center: { x: 0, y: 0 },
    radius: 0.5,
    color: "#000000",
    is_filled: false,
  })

  const symbolData = buildSymbolDataFromSchematicPrimitives({
    circuitJson: [
      transparentCircle,
      transparentLine,
      transparentPath,
      transparentArc,
      transparentRect,
      visibleCircle,
    ],
    schematicSymbolId: "sym_markers",
    schematicSymbol: { center: { x: 0, y: 0 } },
  })
  const drawing = createDrawingSubsymbol({
    libId: "Custom:markers_symbol",
    symbolData,
    isChip: false,
    c2kMatSchScale: 10,
  })

  expect(drawing.circles).toHaveLength(1)
  expect(drawing.circles[0]?.getString()).toContain("(radius 5)")
  expect(drawing.polylines).toHaveLength(0)
  expect(drawing.arcs).toHaveLength(0)
  expect(drawing.rectangles).toHaveLength(0)
})

test("builtin schematic-symbols text primitives emit symbol body labels without placeholder fields", () => {
  const wattmeterData = getSchematicSymbolData("wattmeter_horz")
  expect(wattmeterData).toBeDefined()

  const wattmeterDrawing = createDrawingSubsymbol({
    libId: "Custom:wattmeter_horz",
    symbolData: wattmeterData,
    isChip: false,
    c2kMatSchScale: 10,
  })
  expect(wattmeterDrawing.texts.map((text) => text.value)).toEqual(["W"])
  expect(wattmeterDrawing.texts[0]?.effects?.font?.size).toEqual({
    width: 3,
    height: 3,
  })

  const pfMeterData = getSchematicSymbolData("power_factor_meter_horz")
  expect(pfMeterData).toBeDefined()

  const pfMeterDrawing = createDrawingSubsymbol({
    libId: "Custom:power_factor_meter_horz",
    symbolData: pfMeterData,
    isChip: false,
    c2kMatSchScale: 10,
  })
  expect(pfMeterDrawing.texts.map((text) => text.value)).toEqual(["COS φ"])
  expect(pfMeterDrawing.texts[0]?.effects?.font?.size).toEqual({
    width: 2,
    height: 2,
  })
})
