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

function roundSymbolCoordinate(mm: number, transformMagnitude: number): number {
  const units = Math.abs(mm) * 10_000
  const halfUnit = Math.floor(units) + 0.5
  // Translation can cancel most of a scaled coordinate. Estimate roundoff from
  // the terms before cancellation, not just the small resulting local offset.
  const roundoff = Number.EPSILON * transformMagnitude * 10_000
  const stableUnits = Math.abs(units - halfUnit) <= roundoff ? halfUnit : units
  return (Math.sign(mm) * Math.round(stableUnits)) / 10_000
}

/**
 * Round library artwork consistently when placement arithmetic puts the same
 * local point on either side of a half-unit tie. Only floating-point roundoff
 * is treated as a tie; distinct coordinates still use KiCad's native grid.
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
