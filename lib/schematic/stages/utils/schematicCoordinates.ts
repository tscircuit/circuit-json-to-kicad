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

/** Transform decimal artwork coordinates, rounding only the final KiCad IU. */
export function roundSchematicSymbolCoordinate(
  coordinate: number,
  origin: number,
  scale: number,
): number {
  // Represent each supplied decimal as coefficient * 10^exponent. Integer
  // subtraction and multiplication preserve digits at rounding boundaries.
  const decimals = [coordinate, origin, scale].map((value) => {
    const [mantissa, exponent = "0"] = value.toString().split("e")
    const [whole, fraction = ""] = mantissa!.split(".")
    return {
      coefficient: BigInt(whole! + fraction),
      exponent: Number(exponent) - fraction.length,
    }
  })
  const exponent = Math.min(...decimals.map((decimal) => decimal.exponent))
  const [point, center, factor] = decimals.map(
    (decimal) =>
      decimal.coefficient * 10n ** BigInt(decimal.exponent - exponent),
  )
  const scaled = (point! - center!) * factor!
  // The product carries two powers of the common decimal exponent; shifting
  // by four converts mm to KiCad IU before rounding halves away from zero.
  const unitExponent = 2 * exponent + 4
  if (unitExponent >= 0) {
    return Number(scaled * 10n ** BigInt(unitExponent)) / 10_000
  }
  const divisor = 10n ** BigInt(-unitExponent)
  const magnitude = scaled < 0n ? -scaled : scaled
  const units = (magnitude + divisor / 2n) / divisor
  return Number(scaled < 0n ? -units : units) / 10_000
}
