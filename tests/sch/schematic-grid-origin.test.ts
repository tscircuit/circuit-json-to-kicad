import { expect, test } from "bun:test"
import type { SchematicComponent } from "circuit-json"
import { SchematicSymbol, SymbolPin, SymbolRectangle } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { alignSchematicConnectionsToGrid } from "lib/schematic/stages/utils/alignSchematicConnectionsToGrid"
import { compose, scale, translate } from "transformation-matrix"

for (const axis of ["x", "y"] as const) {
  for (const sheetCoordinate of [-1.27, 1.27]) {
    test(`preserves aligned pins on ${axis}=${sheetCoordinate} with a fractional origin`, () => {
      const converter = new CircuitJsonToKicadSchConverter([])
      const origin = { x: 0, y: 0, [axis]: sheetCoordinate - 0.635 }
      converter.ctx.c2kMatSch = compose(
        translate(origin.x, origin.y),
        scale(1, -1),
      )
      const component: SchematicComponent = {
        type: "schematic_component",
        schematic_component_id: "U1",
        source_component_id: "source_U1",
        is_box_with_pins: false,
        center: { x: 0, y: 0 },
        size: { width: 5.08, height: 5.08 },
      }
      const unit = new SchematicSymbol({ libraryId: "Example_1_1" })
      const body = SymbolRectangle.fromSexprPrimitives([
        ["start", -2.54, axis === "y" ? -0.635 : -2.54],
        ["end", axis === "x" ? 0.635 : 2.54, 2.54],
      ])
      unit.rectangles.push(body)
      const originalBody = body.getString()
      for (const tangent of [-1.27, 1.27]) {
        const pin = new SymbolPin()
        pin.at = axis === "x" ? [0.635, tangent, 180] : [tangent, -0.635, 90]
        pin.length = 0.01
        unit.pins.push(pin)
      }
      const symbol = new SchematicSymbol({ libraryId: "Custom:Example" })
      symbol.subSymbols.push(unit)

      const placement = alignSchematicConnectionsToGrid(converter.ctx, [
        { component, symbol },
      ])
      expect(placement).toBeDefined()
      // Both pins were on the sheet grid before local pin normalization.
      // Their instance origin must follow the pins, not push them forward.
      const placedOrigin = placement!.origins.get("U1")!
      for (const pin of unit.pins) {
        const position = {
          x: placedOrigin.x + pin.at!.x,
          y: placedOrigin.y - pin.at!.y,
        }
        expect(position[axis]).toBe(sheetCoordinate)
        expect(pin.length).toBe(0.635)
      }
      for (const [original, placed] of [
        ...placement!.grid.x,
        ...placement!.grid.y,
      ]) {
        expect(placed).toBe(original)
      }
      expect(body.getString()).toBe(originalBody)
    })
  }
}
