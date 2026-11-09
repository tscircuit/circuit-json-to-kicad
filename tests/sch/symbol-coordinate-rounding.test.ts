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

test("symbol rounding accounts for accumulated error across the conversion", () => {
  // Each of these failed with only EPSILON * transformMagnitude as the budget.
  for (const { local, center, expected } of [
    { local: 1.05415, center: 0.3149, expected: 15.8123 },
    { local: -0.09405, center: 0.064, expected: -1.4108 },
  ]) {
    expect(
      transformSymbolPoint(compose(scale(15), translate(-center, center)), {
        x: local + center,
        y: -local - center,
      }),
    ).toEqual({ x: expected, y: -expected })
  }
})

test("translated decimal coordinates agree with an exact integer midpoint oracle", () => {
  for (const center of [-10, -0.485, 0, 0.3149, 10]) {
    const transform = compose(scale(15), translate(-center, center))
    for (let numerator = -199_999; numerator <= 199_999; numerator += 202) {
      // For odd integers, (numerator / 100000) * 15 * 10000 is exactly
      // numerator * 1.5: an exactly representable half-integer oracle.
      const local = numerator / 100_000
      for (const offsetMm of [-1e-8, 0, 1e-8]) {
        const exactUnits = numerator * 1.5 + offsetMm * 10_000
        const expected =
          (Math.sign(exactUnits) * Math.round(Math.abs(exactUnits))) / 10_000
        const point = center + local + offsetMm / 15
        expect(
          transformSymbolPoint(transform, { x: point, y: -point }),
        ).toEqual({
          x: expected,
          y: -expected,
        })
      }
    }
  }
})

test("symbol rounding does not guess when precision spans multiple boundaries", () => {
  // At this magnitude, placement has lost more than a native coordinate unit.
  // The observed local result is +/-1.08203125; ordinary rounding is +/-1.082.
  expect(
    transformSymbolPoint(compose(scale(15), translate(-1e12, 1e12)), {
      x: 1e12 + 0.07219,
      y: -1e12 - 0.07219,
    }),
  ).toEqual({ x: 1.082, y: -1.082 })
})

test("native sheet rounding remains exact for pin and wire connectivity", () => {
  expect(toSchematicInternalUnits(1.08285)).toBe(10829)
  expect(toSchematicInternalUnits(1.08285 - Number.EPSILON)).toBe(10828)
  expect(toSchematicInternalUnits(-1.08285)).toBe(-10829)
  expect(toSchematicInternalUnits(-1.08285 + Number.EPSILON)).toBe(-10828)
})
