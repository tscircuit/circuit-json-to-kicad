import type { Point } from "circuit-json"
import { applyToPoint, type Matrix } from "transformation-matrix"

// KiCad's SCH_IU_PER_MM is 1e4 (100 nm per schematic internal unit).
// https://docs.kicad.org/doxygen/base__units_8h.html
// Round halves away from zero, as its schematic parser does with KiROUND.
export function toSchematicInternalUnits(mm: number): number {
  return Math.sign(mm) * Math.round(Math.abs(mm) * 10_000)
}

export function roundSchematicCoordinate(mm: number): number {
  return toSchematicInternalUnits(mm) / 10_000
}

export function transformSchematicPoint(
  transform: Matrix,
  point: Point,
): Point {
  const { x, y } = applyToPoint(transform, point)
  return { x: roundSchematicCoordinate(x), y: roundSchematicCoordinate(y) }
}

// Unit roundoff for binary64 round-to-nearest is EPSILON / 2. Budget the six
// roundings in the reported path: source-coordinate conversion, placement,
// scaling the point, scaling the origin, subtracting, and conversion to IU.
// gamma_n = n*u/(1-n*u) is the standard accumulated roundoff factor.
// https://doi.org/10.1017/S0962492922000022, section 3.
const UNIT_ROUNDOFF = Number.EPSILON / 2
const SYMBOL_ROUNDOFF_FACTOR = (6 * UNIT_ROUNDOFF) / (1 - 6 * UNIT_ROUNDOFF)

function roundSymbolCoordinate(mm: number, transformMagnitude: number): number {
  const units = Math.abs(mm) * 10_000
  const halfUnit = Math.floor(units) + 0.5
  // Translation can cancel most of a scaled coordinate. Bound roundoff from
  // the terms before cancellation, not just the small resulting local offset.
  const roundoff = SYMBOL_ROUNDOFF_FACTOR * transformMagnitude * 10_000
  // If precision is too poor to isolate a single rounding boundary, retain
  // ordinary rounding instead of choosing a midpoint within a broad interval.
  const stableUnits =
    roundoff < 0.5 && Math.abs(units - halfUnit) <= roundoff ? halfUnit : units
  return (Math.sign(mm) * Math.round(stableUnits)) / 10_000
}

/**
 * Round library artwork consistently when placement arithmetic puts the same
 * local point on either side of a half-unit tie. The error budget covers one
 * source conversion/placement and our scale/translation, not arbitrary earlier
 * geometry calculations. Values outside that budget use ordinary rounding.
 * Sheet pins/wires must instead follow the parser's exact coordinate rounding.
 */
export function transformSymbolPoint(transform: Matrix, point: Point): Point {
  const { x, y } = applyToPoint(transform, point)
  return {
    x: roundSymbolCoordinate(
      x,
      Math.abs(transform.a * point.x) +
        Math.abs(transform.c * point.y) +
        Math.abs(transform.e),
    ),
    y: roundSymbolCoordinate(
      y,
      Math.abs(transform.b * point.x) +
        Math.abs(transform.d * point.y) +
        Math.abs(transform.f),
    ),
  }
}
