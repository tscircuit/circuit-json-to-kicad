import { expect, test } from "bun:test"
import {
  toSchematicInternalUnits,
  transformSymbolPoint,
} from "lib/schematic/stages/utils/schematicCoordinates"
import { compose, scale, translate } from "transformation-matrix"

test.each([1, 7.5, 15, 30])(
  "symbol rounding is independent of placement at scale %s",
  (factor) => {
    for (const x of [-1000, -2.55, 0, 2.205, 1000]) {
      for (const y of [-1000, -2.55, 0, 2.205, 1000]) {
        const transform = compose(scale(factor), translate(-x, -y))
        // Both signs lie exactly halfway between native schematic units.
        expect(
          transformSymbolPoint(transform, {
            x: x - 1.08285 / factor,
            y: y + 1.08285 / factor,
          }),
        ).toEqual({ x: -1.0829, y: 1.0829 })
      }
    }
  },
)

test("symbol rounding preserves real differences on either side of a tie", () => {
  const factor = 15
  const center = { x: 2.205, y: -2.55 }
  const transform = compose(scale(factor), translate(-center.x, -center.y))
  const transformOffset = (mm: number) =>
    transformSymbolPoint(transform, {
      x: center.x + mm / factor,
      y: center.y - mm / factor,
    })

  // These offsets are much smaller than one native unit, but larger than
  // floating-point roundoff. They must still round to different coordinates.
  expect(transformOffset(1.08285 - 1e-10)).toEqual({ x: 1.0828, y: -1.0828 })
  expect(transformOffset(1.08285 + 1e-10)).toEqual({ x: 1.0829, y: -1.0829 })
  expect(transformOffset(1.08285 + 0.0001)).toEqual({ x: 1.083, y: -1.083 })
})

test("native sheet rounding remains exact for pin and wire connectivity", () => {
  expect(toSchematicInternalUnits(1.08285)).toBe(10829)
  expect(toSchematicInternalUnits(1.08285 - Number.EPSILON)).toBe(10828)
  expect(toSchematicInternalUnits(-1.08285)).toBe(-10829)
  expect(toSchematicInternalUnits(-1.08285 + Number.EPSILON)).toBe(-10828)
})
