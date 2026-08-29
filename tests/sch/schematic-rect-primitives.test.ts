import { expect, test } from "bun:test"
import { schematic_rect } from "circuit-json"
import { buildSymbolDataFromSchematicPrimitives } from "lib/schematic/stages/symbols-stage-converters/buildSymbolDataFromSchematicPrimitives"
import { createDrawingSubsymbol } from "lib/schematic/stages/symbols-stage-converters/createDrawingSubsymbol"

for (const rotation of [0, 360, -360, 45, 90]) {
  test(`schematic rectangle at ${rotation} degrees uses the appropriate KiCad primitive`, () => {
    const rect = schematic_rect.parse({
      schematic_symbol_id: "symbol1",
      type: "schematic_rect",
      center: { x: 3, y: 4 },
      width: 4,
      height: 2,
      rotation,
      stroke_width: 0.1,
      is_dashed: true,
      is_filled: true,
      fill_color: "#123456",
    })
    const symbolData = buildSymbolDataFromSchematicPrimitives({
      circuitJson: [rect],
      schematicSymbolId: "symbol1",
      schematicSymbol: { center: rect.center },
    })
    const drawing = createDrawingSubsymbol({
      libId: "Custom:rectangle",
      symbolData,
      isChip: false,
      c2kMatSchScale: 2,
    })
    const isRotated = rotation % 360 !== 0
    expect(drawing.rectangles).toHaveLength(isRotated ? 0 : 1)
    expect(drawing.polylines).toHaveLength(isRotated ? 1 : 0)
    const output = drawing.getString()
    expect(output).toContain("(width 0.2)")
    expect(output).toContain("(type dash)")
    expect(output).toContain("(color 18 52 86 1)")
    if (!isRotated) {
      expect(output).toContain("(start -4 -2)")
      expect(output).toContain("(end 4 2)")
    } else {
      const points = drawing.polylines[0]!.points!.points
      expect(points).toHaveLength(5)
      expect(points[0]).toEqual(points[4])
      const radians = (rotation * Math.PI) / 180
      expect(points[0]!.x).toBeCloseTo(
        -4 * Math.cos(radians) + 2 * Math.sin(radians),
      )
      expect(points[0]!.y).toBeCloseTo(
        -4 * Math.sin(radians) - 2 * Math.cos(radians),
      )
    }
  })
}
