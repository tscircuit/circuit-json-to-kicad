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
  transform: Matrix | Matrix[],
  point: Point,
): Point {
  if (!Array.isArray(transform)) {
    const { x, y } = applyToPoint(transform, point)
    return { x: roundSchematicCoordinate(x), y: roundSchematicCoordinate(y) }
  }

  // Evaluate uncomposed matrices using exact decimal integers. Composing them
  // first can round their translation before the point reaches the KiCad grid.
  const values = [
    point.x,
    point.y,
    ...transform.flatMap(({ a, b, c, d, e, f }) => [a, b, c, d, e, f]),
  ]
  const decimals = values.map((value) => {
    const [mantissa, exponent = "0"] = value.toString().split("e")
    const [whole, fraction = ""] = mantissa!.split(".")
    return {
      coefficient: BigInt(whole! + fraction),
      exponent: Number(exponent) - fraction.length,
    }
  })
  const exponent = Math.min(0, ...decimals.map((decimal) => decimal.exponent))
  const integers = decimals.map(
    (decimal) =>
      decimal.coefficient * 10n ** BigInt(decimal.exponent - exponent),
  )
  const divisor = 10n ** BigInt(-exponent)
  let denominator = divisor
  let x = integers[0]!
  let y = integers[1]!
  // Like compose(), the rightmost matrix acts on the point first.
  for (let i = transform.length - 1; i >= 0; i--) {
    const [a, b, c, d, e, f] = integers.slice(2 + i * 6, 8 + i * 6)
    const nextX = a! * x + c! * y + e! * denominator
    y = b! * x + d! * y + f! * denominator
    x = nextX
    denominator *= divisor
  }
  const round = (coordinate: bigint): number => {
    const magnitude = coordinate < 0n ? -coordinate : coordinate
    const units = (magnitude * 10_000n + denominator / 2n) / denominator
    return Number(coordinate < 0n ? -units : units) / 10_000
  }
  return { x: round(x), y: round(y) }
}
