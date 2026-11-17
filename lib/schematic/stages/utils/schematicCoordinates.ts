import type { Point } from "circuit-json"
import { applyToPoint, type Matrix } from "transformation-matrix"

export type SchematicConnectionGrid = {
  x: ReadonlyMap<number, number>
  y: ReadonlyMap<number, number>
}

// KiCad's SCH_IU_PER_MM is 1e4 (100 nm per schematic internal unit).
// https://docs.kicad.org/doxygen/base__units_8h.html
const SCHEMATIC_INTERNAL_UNITS_PER_MM = 10_000
const HALF_INTERNAL_UNIT = 0.5
const UNIT_ROUNDOFF = Number.EPSILON / 2

// Source conversion, placement, scaling the point and origin, subtraction,
// and conversion to KiCad IU: gamma_n = n*u/(1-n*u).
const SYMBOL_COORDINATE_ROUNDING_STEPS = 6
const SYMBOL_COORDINATE_ROUNDOFF_FACTOR =
  (SYMBOL_COORDINATE_ROUNDING_STEPS * UNIT_ROUNDOFF) /
  (1 - SYMBOL_COORDINATE_ROUNDING_STEPS * UNIT_ROUNDOFF)

// Round halves away from zero, as its schematic parser does with KiROUND.
export function toSchematicInternalUnits(mm: number): number {
  return (
    Math.sign(mm) * Math.round(Math.abs(mm) * SCHEMATIC_INTERNAL_UNITS_PER_MM)
  )
}

export function fromSchematicInternalUnits(coordinate: number): number {
  return coordinate / SCHEMATIC_INTERNAL_UNITS_PER_MM
}

export function roundSchematicCoordinate(mm: number): number {
  return fromSchematicInternalUnits(toSchematicInternalUnits(mm))
}

export function transformSchematicPoint(
  transform: Matrix,
  point: Point,
): Point {
  const { x, y } = applyToPoint(transform, point)
  return { x: roundSchematicCoordinate(x), y: roundSchematicCoordinate(y) }
}

export function transformSchematicConnectionPoint({
  transform,
  point,
  grid,
}: {
  transform: Matrix
  point: Point
  grid?: SchematicConnectionGrid
}): Point {
  const transformed = applyToPoint(transform, point)
  if (!grid) return transformed
  const x = grid.x.get(toSchematicInternalUnits(transformed.x))
  const y = grid.y.get(toSchematicInternalUnits(transformed.y))
  if (x === undefined || y === undefined) {
    throw new Error("Schematic connection was not included in grid placement")
  }
  return { x: fromSchematicInternalUnits(x), y: fromSchematicInternalUnits(y) }
}

function roundSymbolCoordinate(mm: number, magnitude: number): number {
  const units = Math.abs(mm) * SCHEMATIC_INTERNAL_UNITS_PER_MM
  const midpoint = Math.floor(units) + HALF_INTERNAL_UNIT
  const tolerance =
    SYMBOL_COORDINATE_ROUNDOFF_FACTOR *
    magnitude *
    SCHEMATIC_INTERNAL_UNITS_PER_MM
  // Only resolve a nearby tie when the tolerance isolates one boundary.
  const roundedUnits =
    tolerance < HALF_INTERNAL_UNIT && Math.abs(units - midpoint) <= tolerance
      ? Math.sign(mm) * Math.ceil(midpoint)
      : toSchematicInternalUnits(mm)
  return roundedUnits / SCHEMATIC_INTERNAL_UNITS_PER_MM
}

/** Transform library artwork with tolerance for placement roundoff at ties. */
export function transformSymbolPoint(transform: Matrix, point: Point): Point {
  const { x, y } = applyToPoint(transform, point)

  // Circuit JSON already contains placed artwork; subtracting its origin
  // cannot recover the original local precision. Use the terms before
  // cancellation to allow for placement roundoff, not arbitrary upstream math.
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
