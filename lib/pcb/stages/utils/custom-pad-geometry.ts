import type { Point } from "circuit-json"
import earcut from "earcut"
import { PadPrimitiveGrPoly, PadPrimitives, Pts, Xy } from "kicadts"
import { applyToPoint, compose, scale, translate } from "transformation-matrix"

export type Triangle = [Point, Point, Point]

const getTriangleTwiceArea = (a: Point, b: Point, c: Point): number =>
  Math.abs(a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))

export const triangulatePolygonWithHoles = (
  outerContour: Point[],
  holes: Point[][] = [],
): Triangle[] => {
  const flattenedPoints: number[] = []
  const holeIndices: number[] = []
  let pointCount = 0

  const addContour = (contour: Point[]) => {
    for (const point of contour) {
      flattenedPoints.push(point.x, point.y)
    }
    pointCount += contour.length
  }

  addContour(outerContour)
  for (const hole of holes) {
    holeIndices.push(pointCount)
    addContour(hole)
  }

  const triangleIndices = earcut(flattenedPoints, holeIndices, 2)
  const triangles: Triangle[] = []

  for (let index = 0; index < triangleIndices.length; index += 3) {
    const aIndex = triangleIndices[index]
    const bIndex = triangleIndices[index + 1]
    const cIndex = triangleIndices[index + 2]
    if (aIndex === undefined || bIndex === undefined || cIndex === undefined) {
      continue
    }

    const getPoint = (pointIndex: number): Point => ({
      x: flattenedPoints[pointIndex * 2]!,
      y: flattenedPoints[pointIndex * 2 + 1]!,
    })
    const triangle: Triangle = [
      getPoint(aIndex),
      getPoint(bIndex),
      getPoint(cIndex),
    ]

    if (getTriangleTwiceArea(...triangle) === 0) continue
    triangles.push(triangle)
  }

  return triangles
}

const getDistance = (a: Point, b: Point): number =>
  Math.hypot(a.x - b.x, a.y - b.y)

export const getSafePolygonAnchor = (
  outerContour: Point[],
  holes: Point[][] = [],
): { center: Point; diameter: number; triangles: Triangle[] } => {
  const triangles = triangulatePolygonWithHoles(outerContour, holes)
  let bestTriangle: { center: Point; inradius: number } | undefined

  for (const [a, b, c] of triangles) {
    const sideA = getDistance(b, c)
    const sideB = getDistance(c, a)
    const sideC = getDistance(a, b)
    const perimeter = sideA + sideB + sideC
    if (perimeter === 0) continue

    const inradius = getTriangleTwiceArea(a, b, c) / perimeter
    const center = {
      x: (sideA * a.x + sideB * b.x + sideC * c.x) / perimeter,
      y: (sideA * a.y + sideB * b.y + sideC * c.y) / perimeter,
    }

    if (!bestTriangle || inradius > bestTriangle.inradius) {
      bestTriangle = { center, inradius }
    }
  }

  if (!bestTriangle) {
    throw new Error("Polygon must contain a valid filled area")
  }

  return {
    center: bestTriangle.center,
    diameter: Math.min(0.001, bestTriangle.inradius),
    triangles,
  }
}

export const createFilledPolygonPrimitives = ({
  contours,
  center,
}: {
  contours: Point[][]
  center: Point
}): PadPrimitives => {
  const toLocalContour = (points: Point[]) =>
    new Pts(
      points.map((point) => {
        const localPoint = applyToPoint(
          compose(scale(1, -1), translate(-center.x, -center.y)),
          point,
        )
        return new Xy(localPoint.x, localPoint.y)
      }),
    )

  const primitives = new PadPrimitives()
  for (const contour of contours) {
    const polygon = new PadPrimitiveGrPoly()
    polygon.contours = [toLocalContour(contour)]
    polygon.width = 0
    polygon.filled = true
    primitives.addGraphic(polygon)
  }
  return primitives
}

export const createEllipseContour = ({
  center,
  width,
  height,
  segmentCount = 64,
}: {
  center: Point
  width: number
  height: number
  segmentCount?: number
}): Point[] => {
  if (width <= 0 || height <= 0) {
    throw new Error("Ellipse must have positive dimensions")
  }

  // KiCad has no elliptical pad primitive. With the default 64 segments, the
  // maximum radial approximation error is below 0.13% of the ellipse radius.
  return Array.from({ length: segmentCount }, (_, index) => {
    const angle = (index / segmentCount) * Math.PI * 2
    return {
      x: center.x + (width / 2) * Math.cos(angle),
      y: center.y + (height / 2) * Math.sin(angle),
    }
  })
}
