import type { Point } from "circuit-json"
import {
  SymbolArcStart,
  SymbolArcMid,
  SymbolArcEnd,
  type SymbolArc,
} from "kicadts"
import { applyToPoint, translate } from "transformation-matrix"
import { toSchematicInternalUnits } from "./schematicCoordinates"

export type SymbolArcAttachment = {
  type: "arc"
  center: Point
  radius: number
  normalSign: number
  tangentBounds: { lower: number; upper: number }
}

const normalizeRadians = (radians: number) =>
  ((radians % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)

/** Find the circular branch containing the original pin contact. Its bounds
 * stop at the arc ends and tangent extrema, so placement cannot extend a pin
 * onto the missing part of the circle or switch to the opposite side.
 */
export function getSymbolArcAttachment({
  arc,
  point,
  direction,
}: {
  arc: SymbolArc
  point: Point
  direction: Point
}): SymbolArcAttachment | undefined {
  const children = arc.getChildren()
  const arcStart = children.find((child) => child instanceof SymbolArcStart)
  const arcMid = children.find((child) => child instanceof SymbolArcMid)
  const arcEnd = children.find((child) => child instanceof SymbolArcEnd)
  if (!arcStart || !arcMid || !arcEnd) return undefined
  const [start, mid, end] = [arcStart, arcMid, arcEnd].map((vertex) => ({
    x: toSchematicInternalUnits(vertex.x),
    y: toSchematicInternalUnits(vertex.y),
  })) as [Point, Point, Point]

  // The circumcenter of KiCad's three arc points, calculated relative to the
  // start to avoid subtracting large absolute-coordinate squares.
  const relativeToStart = translate(-start.x, -start.y)
  const middle = applyToPoint(relativeToStart, mid)
  const last = applyToPoint(relativeToStart, end)
  const determinant = 2 * (middle.x * last.y - middle.y * last.x)
  if (determinant === 0) return undefined
  const middleSquared = middle.x ** 2 + middle.y ** 2
  const lastSquared = last.x ** 2 + last.y ** 2
  const offset = {
    x: (last.y * middleSquared - middle.y * lastSquared) / determinant,
    y: (middle.x * lastSquared - last.x * middleSquared) / determinant,
  }
  const center = applyToPoint(translate(start.x, start.y), offset)
  const radius = Math.hypot(offset.x, offset.y)
  // Arc vertices and pin contacts are independently rounded to native units.
  // One native unit (0.0001 mm) is the coordinate-resolution bound, not a grid
  // tolerance: contacts outside that bound are not attached to this arc.
  if (Math.abs(Math.hypot(point.x - center.x, point.y - center.y) - radius) > 1)
    return undefined

  const angles = [start, mid, end].map((vertex) =>
    Math.atan2(vertex.y - center.y, vertex.x - center.x),
  )
  let startAngle = angles[0]!
  let endAngle = angles[2]!
  if (
    normalizeRadians(angles[1]! - startAngle) >
    normalizeRadians(endAngle - startAngle)
  )
    [startAngle, endAngle] = [endAngle, startAngle]
  const sweep = normalizeRadians(endAngle - startAngle)
  let contactAngle = Math.atan2(point.y - center.y, point.x - center.x)
  // Preserve membership of rounded endpoints at the 0/2pi boundary.
  if (Math.hypot(point.x - start.x, point.y - start.y) <= 1)
    contactAngle = angles[0]!
  if (Math.hypot(point.x - end.x, point.y - end.y) <= 1)
    contactAngle = angles[2]!
  const contactOffset = normalizeRadians(contactAngle - startAngle)
  if (contactOffset > sweep) return undefined

  const normal = direction.x !== 0 ? "x" : "y"
  const tangent = normal === "x" ? "y" : "x"
  const extrema =
    normal === "x" ? [Math.PI / 2, (3 * Math.PI) / 2] : [0, Math.PI]
  const cuts = [
    {
      offset: 0,
      tangent: startAngle === angles[0] ? start[tangent] : end[tangent],
    },
    {
      offset: sweep,
      tangent: endAngle === angles[2] ? end[tangent] : start[tangent],
    },
    ...extrema
      .map((angle, index) => ({
        offset: normalizeRadians(angle - startAngle),
        tangent: center[tangent] + (index === 0 ? radius : -radius),
      }))
      .filter(({ offset }) => offset > 0 && offset < sweep),
  ].sort((a, b) => a.offset - b.offset)
  const contactSide =
    Math.sign(point[normal] - center[normal]) || direction[normal]
  for (let index = 1; index < cuts.length; index++) {
    const lower = cuts[index - 1]!
    const upper = cuts[index]!
    if (contactOffset < lower.offset || contactOffset > upper.offset) continue
    const branchAngle = startAngle + (lower.offset + upper.offset) / 2
    const normalSign = Math.sign(
      normal === "x" ? Math.cos(branchAngle) : Math.sin(branchAngle),
    )
    if (normalSign !== contactSide) continue
    const endpoints = [lower.tangent, upper.tangent]
    return {
      type: "arc",
      center,
      radius,
      normalSign,
      tangentBounds: {
        lower: Math.max(Math.min(...endpoints), center[tangent] - radius),
        upper: Math.min(Math.max(...endpoints), center[tangent] + radius),
      },
    }
  }
  return undefined
}
