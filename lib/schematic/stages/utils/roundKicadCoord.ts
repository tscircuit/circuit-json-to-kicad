import { applyToPoint, type Matrix } from "transformation-matrix"

/**
 * Number of decimal places (in mm) KiCad schematic coordinates are rounded to.
 * Six decimals is well below KiCad's own storage resolution while being more
 * than enough to keep distinct schematic features apart.
 */
const COORD_DECIMALS = 6
const FACTOR = 10 ** COORD_DECIMALS

/**
 * Round a coordinate to KiCad's coordinate precision, removing floating-point
 * representation noise (e.g. `-0.44999999999999996` -> `-0.45`).
 *
 * KiCad schematic connectivity is coordinate-based (there is no net system at
 * the .kicad_sch level), so a pin emitted at `-0.4499…` and a wire endpoint
 * emitted at `-0.45` no longer coincide and the wire reads as disconnected.
 * Rounding every emitted coordinate the same way keeps pins and wires landing
 * on the exact same value. See issue #292.
 */
export const roundKicadCoord = (n: number): number => {
  const rounded = Math.round(n * FACTOR) / FACTOR
  // Normalize -0 to 0 for clean, stable output.
  return rounded === 0 ? 0 : rounded
}

/**
 * `applyToPoint` followed by coordinate rounding, so every transformed point
 * lands on a clean, connectivity-stable value. See {@link roundKicadCoord}.
 */
export const applyToPointRounded = (
  matrix: Matrix,
  point: { x: number; y: number },
): { x: number; y: number } => {
  const p = applyToPoint(matrix, point)
  return { x: roundKicadCoord(p.x), y: roundKicadCoord(p.y) }
}
