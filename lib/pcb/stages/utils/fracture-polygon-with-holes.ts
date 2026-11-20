import type { Point } from "circuit-json"

const COORD_EPS = 1e-9
const ANGLE_EPS = 1e-12

const pointsEqual = (a: Point, b: Point, eps = COORD_EPS): boolean =>
  Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps

export const getSignedPolygonTwiceArea = (points: readonly Point[]): number => {
  let twiceArea = 0
  for (let i = 0; i < points.length; i++) {
    const current = points[i]!
    const next = points[(i + 1) % points.length]!
    twiceArea += current.x * next.y - next.x * current.y
  }
  return twiceArea
}

const cleanRing = (points: readonly Point[]): Point[] => {
  const deduped: Point[] = []
  for (const point of points) {
    const prev = deduped[deduped.length - 1]
    if (prev && pointsEqual(prev, point)) continue
    deduped.push({ x: point.x, y: point.y })
  }
  while (
    deduped.length > 1 &&
    pointsEqual(deduped[0]!, deduped[deduped.length - 1]!)
  ) {
    deduped.pop()
  }
  return deduped
}

const ensureSignedOrientation = (
  points: readonly Point[],
  positiveSign: boolean,
): Point[] => {
  const cleaned = cleanRing(points)
  if (cleaned.length < 3) return []
  const twiceArea = getSignedPolygonTwiceArea(cleaned)
  if (Math.abs(twiceArea) <= COORD_EPS) return []
  if (positiveSign ? twiceArea < 0 : twiceArea > 0) {
    return [...cleaned].reverse()
  }
  return cleaned
}

const normalizeAngleTwoPi = (angle: number): number => {
  const twoPi = Math.PI * 2
  const wrapped = angle % twoPi
  return wrapped < 0 ? wrapped + twoPi : wrapped
}

const isPositiveXInInteriorSector = (
  prev: Point,
  vertex: Point,
  next: Point,
): boolean => {
  const inDx = prev.x - vertex.x
  const inDy = prev.y - vertex.y
  const outDx = next.x - vertex.x
  const outDy = next.y - vertex.y
  if (
    Math.hypot(inDx, inDy) <= COORD_EPS ||
    Math.hypot(outDx, outDy) <= COORD_EPS
  ) {
    return false
  }

  const aOut = normalizeAngleTwoPi(Math.atan2(outDy, outDx))
  const aIn = normalizeAngleTwoPi(Math.atan2(inDy, inDx))

  // For a positively oriented polygon (interior to the left of prev -> vertex -> next),
  // the interior angular sector at `vertex` sweeps CCW from `aOut` to `aIn`.
  // Angle 0 (+X) lies strictly inside that CCW sweep iff the sweep wraps past 2*pi.
  return aOut > aIn && aOut > ANGLE_EPS && aIn > ANGLE_EPS
}

const isDirectionInInteriorSector = (
  prev: Point,
  vertex: Point,
  next: Point,
  dir: Point,
): boolean => {
  const inDx = prev.x - vertex.x
  const inDy = prev.y - vertex.y
  const outDx = next.x - vertex.x
  const outDy = next.y - vertex.y
  if (
    Math.hypot(inDx, inDy) <= COORD_EPS ||
    Math.hypot(outDx, outDy) <= COORD_EPS ||
    Math.hypot(dir.x, dir.y) <= COORD_EPS
  ) {
    return false
  }

  const aOut = normalizeAngleTwoPi(Math.atan2(outDy, outDx))
  const aIn = normalizeAngleTwoPi(Math.atan2(inDy, inDx))
  const aDir = normalizeAngleTwoPi(Math.atan2(dir.y, dir.x))

  if (aOut < aIn) {
    return aDir > aOut + ANGLE_EPS && aDir < aIn - ANGLE_EPS
  }
  if (aOut > aIn) {
    return aDir > aOut + ANGLE_EPS || aDir < aIn - ANGLE_EPS
  }
  return false
}

const findPrevDistinctPoint = (
  poly: readonly Point[],
  index: number,
): Point => {
  const current = poly[index]!
  for (let step = 1; step < poly.length; step++) {
    const candidate = poly[(index - step + poly.length) % poly.length]!
    if (!pointsEqual(candidate, current)) return candidate
  }
  return current
}

const findNextDistinctPoint = (
  poly: readonly Point[],
  index: number,
): Point => {
  const current = poly[index]!
  for (let step = 1; step < poly.length; step++) {
    const candidate = poly[(index + step) % poly.length]!
    if (!pointsEqual(candidate, current)) return candidate
  }
  return current
}

const rotateHoleToLeftmostVertex = (hole: readonly Point[]): Point[] => {
  let leftmostIndex = 0
  for (let i = 1; i < hole.length; i++) {
    const point = hole[i]!
    const best = hole[leftmostIndex]!
    if (
      point.x < best.x - COORD_EPS ||
      (Math.abs(point.x - best.x) <= COORD_EPS && point.y < best.y)
    ) {
      leftmostIndex = i
    }
  }
  return [...hole.slice(leftmostIndex), ...hole.slice(0, leftmostIndex)]
}

type RayHit =
  | {
      kind: "vertex"
      vertexIndex: number
      x: number
    }
  | {
      kind: "edge"
      edgeIndex: number
      x: number
      point: Point
    }

const findLeftRayBridgeHit = (
  poly: readonly Point[],
  holeStart: Point,
  holeNext: Point,
): RayHit | undefined => {
  let bestHit: RayHit | undefined

  const considerHit = (candidate: RayHit) => {
    if (!bestHit || candidate.x > bestHit.x + COORD_EPS) {
      bestHit = candidate
      return
    }
    // Prefer an existing vertex over splitting an edge when both occur at the same x.
    if (
      Math.abs(candidate.x - bestHit.x) <= COORD_EPS &&
      candidate.kind === "vertex" &&
      bestHit.kind === "edge"
    ) {
      bestHit = candidate
    }
  }

  for (let i = 0; i < poly.length; i++) {
    const vertex = poly[i]!
    if (
      Math.abs(vertex.y - holeStart.y) <= COORD_EPS &&
      vertex.x <= holeStart.x + COORD_EPS
    ) {
      const prev = findPrevDistinctPoint(poly, i)
      const next = findNextDistinctPoint(poly, i)

      if (pointsEqual(vertex, holeStart)) {
        const holeDir = {
          x: holeNext.x - holeStart.x,
          y: holeNext.y - holeStart.y,
        }
        if (isDirectionInInteriorSector(prev, vertex, next, holeDir)) {
          considerHit({ kind: "vertex", vertexIndex: i, x: vertex.x })
        }
      } else if (isPositiveXInInteriorSector(prev, vertex, next)) {
        considerHit({ kind: "vertex", vertexIndex: i, x: vertex.x })
      }
    }

    const nextVertex = poly[(i + 1) % poly.length]!
    // Only edges going downward in y (vertex.y > nextVertex.y) have the interior
    // of a positively oriented polygon on their +X side.
    if (
      vertex.y > holeStart.y + COORD_EPS &&
      nextVertex.y < holeStart.y - COORD_EPS
    ) {
      const t = (holeStart.y - vertex.y) / (nextVertex.y - vertex.y)
      const xCross = vertex.x + t * (nextVertex.x - vertex.x)
      if (xCross <= holeStart.x + COORD_EPS) {
        considerHit({
          kind: "edge",
          edgeIndex: i,
          x: Math.min(xCross, holeStart.x),
          point: { x: Math.min(xCross, holeStart.x), y: holeStart.y },
        })
      }
    }
  }

  return bestHit
}

/**
 * Fractures a single outer polygon contour and its disjoint inner hole contours
 * into one simple keyhole-bridged polygon contour (matching KiCad's
 * `SHAPE_POLY_SET::Fracture` zone fill representation) so KiCad treats the
 * entire connected copper pour as a single island rather than separate triangles.
 *
 * Returns `undefined` if any hole cannot be bridged cleanly into `outerContour`.
 */
export const fracturePolygonWithHoles = (
  outerContour: readonly Point[],
  holes: readonly Point[][] = [],
): Point[] | undefined => {
  const normalizedOuter = ensureSignedOrientation(outerContour, true)
  if (normalizedOuter.length < 3) return undefined

  const normalizedHoles = holes
    .map((hole) => ensureSignedOrientation(hole, false))
    .filter((hole) => hole.length >= 3)
    .map((hole) => rotateHoleToLeftmostVertex(hole))
    .sort((a, b) => {
      const dx = a[0]!.x - b[0]!.x
      return Math.abs(dx) > COORD_EPS ? dx : a[0]!.y - b[0]!.y
    })

  if (normalizedHoles.length === 0) {
    return normalizedOuter
  }

  let fractured = normalizedOuter

  for (const hole of normalizedHoles) {
    const holeStart = hole[0]!
    const holeNext = hole[1]!
    const hit = findLeftRayBridgeHit(fractured, holeStart, holeNext)
    if (!hit) {
      return undefined
    }

    if (hit.kind === "vertex") {
      const bridgeVertex = fractured[hit.vertexIndex]!
      const splicePoints = pointsEqual(bridgeVertex, holeStart)
        ? [...hole, holeStart]
        : [
            bridgeVertex,
            holeStart,
            ...hole.slice(1),
            holeStart,
            { x: bridgeVertex.x, y: bridgeVertex.y },
          ]

      fractured = [
        ...fractured.slice(0, hit.vertexIndex),
        ...splicePoints,
        ...fractured.slice(hit.vertexIndex + 1),
      ]
    } else {
      const bridgePoint = hit.point
      const splicePoints = pointsEqual(bridgePoint, holeStart)
        ? [...hole, holeStart]
        : [
            bridgePoint,
            holeStart,
            ...hole.slice(1),
            holeStart,
            { x: bridgePoint.x, y: bridgePoint.y },
          ]

      fractured = [
        ...fractured.slice(0, hit.edgeIndex + 1),
        ...splicePoints,
        ...fractured.slice(hit.edgeIndex + 1),
      ]
    }
  }

  return fractured
}
