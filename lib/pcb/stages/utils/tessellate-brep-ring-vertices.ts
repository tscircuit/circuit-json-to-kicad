import type { PcbCopperPourBRep, Point } from "circuit-json"

type BRepVertex =
  PcbCopperPourBRep["brep_shape"]["outer_ring"]["vertices"][number]

const BULGE_EPSILON = 1e-9
// Match KiCad's standard 32-segment circle discretization (11.25 deg per step).
const FULL_CIRCLE_SEGMENTS = 32
const MIN_ARC_SEGMENTS = 4

export function tessellateBrepRingVertices(
  vertices?: readonly BRepVertex[],
): Point[] {
  if (!vertices || vertices.length === 0) return []

  const points: Point[] = []

  for (let index = 0; index < vertices.length; index++) {
    const start = vertices[index]
    const end = vertices[(index + 1) % vertices.length]
    if (!start || !end) continue

    points.push({ x: start.x, y: start.y })

    const bulge = start.bulge
    if (bulge === undefined || bulge === 0 || Math.abs(bulge) <= BULGE_EPSILON)
      continue

    const chordX = end.x - start.x
    const chordY = end.y - start.y
    const chordLength = Math.hypot(chordX, chordY)
    if (chordLength <= 0) continue
    if (chordLength <= BULGE_EPSILON) continue

    const fourBulge = 4 * bulge
    if (fourBulge === 0) continue
    if (Math.abs(fourBulge) <= BULGE_EPSILON) continue

    const sweepAngle = 4 * Math.atan(bulge)
    const centerOffset = (chordLength * (1 - bulge * bulge)) / fourBulge
    const normalX = -chordY / chordLength
    const normalY = chordX / chordLength
    const centerX = (start.x + end.x) / 2 + normalX * centerOffset
    const centerY = (start.y + end.y) / 2 + normalY * centerOffset
    const radius = Math.hypot(start.x - centerX, start.y - centerY)
    const startAngle = Math.atan2(start.y - centerY, start.x - centerX)
    const segmentCount = Math.max(
      MIN_ARC_SEGMENTS,
      Math.ceil((Math.abs(sweepAngle) / (Math.PI * 2)) * FULL_CIRCLE_SEGMENTS),
    )
    if (segmentCount <= 0) continue

    for (let step = 1; step < segmentCount; step++) {
      const angle = startAngle + (sweepAngle * step) / segmentCount
      points.push({
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      })
    }
  }

  return points
}
