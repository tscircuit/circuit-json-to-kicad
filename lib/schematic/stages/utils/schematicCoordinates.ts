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
  { tolerateRoundoff = true }: { tolerateRoundoff?: boolean } = {},
): Point {
  const { x, y } = applyToPoint(transform, point)
  if (!tolerateRoundoff) {
    return { x: roundSchematicCoordinate(x), y: roundSchematicCoordinate(y) }
  }

  // Allow six roundings: source conversion, placement, scaling the point and
  // origin, subtraction, and conversion to KiCad IU. gamma_n = n*u/(1-n*u)
  // accounts for accumulated roundoff; it does not cover arbitrary upstream
  // geometry calculations. Use the terms before cancellation to set its scale.
  const u = Number.EPSILON / 2
  const roundoffFactor = (6 * u) / (1 - 6 * u)
  const round = (mm: number, magnitude: number): number => {
    const units = Math.abs(mm) * 10_000
    const midpoint = Math.floor(units) + 0.5
    const tolerance = roundoffFactor * magnitude * 10_000
    // Only resolve a nearby tie when the tolerance isolates one boundary.
    const stableUnits =
      tolerance < 0.5 && Math.abs(units - midpoint) <= tolerance
        ? midpoint
        : units
    return (Math.sign(mm) * Math.round(stableUnits)) / 10_000
  }
  return {
    x: round(
      x,
      Math.abs(transform.a * point.x) +
        Math.abs(transform.c * point.y) +
        Math.abs(transform.e),
    ),
    y: round(
      y,
      Math.abs(transform.b * point.x) +
        Math.abs(transform.d * point.y) +
        Math.abs(transform.f),
    ),
  }
}
