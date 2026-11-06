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
