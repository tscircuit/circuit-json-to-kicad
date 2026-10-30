import type { PcbSolderPaste } from "circuit-json"
import earcut from "earcut"
import {
  FootprintPad,
  PadOptions,
  PadPrimitiveGrPoly,
  PadPrimitives,
  Pts,
  Xy,
} from "kicadts"
import {
  applyToPoint,
  compose,
  rotate,
  scale,
  translate,
} from "transformation-matrix"
import { generateDeterministicUuid } from "./generateDeterministicUuid"

type Point = { x: number; y: number }
type Triangle = [Point, Point, Point]

const getDistance = (a: Point, b: Point): number =>
  Math.hypot(a.x - b.x, a.y - b.y)

const getPolygonAnchor = (
  outerContour: Point[],
  holes: Point[][] = [],
): { center: Point; diameter: number; triangles: Triangle[] } => {
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
  let bestTriangle: { center: Point; inradius: number } | undefined
  const triangles: Triangle[] = []

  for (let i = 0; i < triangleIndices.length; i += 3) {
    const aIndex = triangleIndices[i]
    const bIndex = triangleIndices[i + 1]
    const cIndex = triangleIndices[i + 2]
    if (aIndex === undefined || bIndex === undefined || cIndex === undefined) {
      continue
    }

    const a = {
      x: flattenedPoints[aIndex * 2]!,
      y: flattenedPoints[aIndex * 2 + 1]!,
    }
    const b = {
      x: flattenedPoints[bIndex * 2]!,
      y: flattenedPoints[bIndex * 2 + 1]!,
    }
    const c = {
      x: flattenedPoints[cIndex * 2]!,
      y: flattenedPoints[cIndex * 2 + 1]!,
    }

    const sideA = getDistance(b, c)
    const sideB = getDistance(c, a)
    const sideC = getDistance(a, b)
    const perimeter = sideA + sideB + sideC
    const twiceArea = Math.abs(
      a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y),
    )
    if (perimeter === 0 || twiceArea === 0) continue

    triangles.push([a, b, c])

    const inradius = twiceArea / perimeter
    const center = {
      x: (sideA * a.x + sideB * b.x + sideC * c.x) / perimeter,
      y: (sideA * a.y + sideB * b.y + sideC * c.y) / perimeter,
    }

    if (!bestTriangle || inradius > bestTriangle.inradius) {
      bestTriangle = { center, inradius }
    }
  }

  if (!bestTriangle) {
    throw new Error("Solder-paste polygon must contain a valid filled area")
  }

  return {
    center: bestTriangle.center,
    // KiCad requires a custom-pad anchor. Keep it inside the chosen triangle
    // so it cannot add material outside the authored paste contour.
    diameter: Math.min(0.001, bestTriangle.inradius),
    triangles,
  }
}

export const getSolderPasteCenter = (
  solderPaste: PcbSolderPaste,
): { x: number; y: number } => {
  if ("x" in solderPaste && "y" in solderPaste) {
    return { x: solderPaste.x, y: solderPaste.y }
  }

  return {
    x:
      solderPaste.points.reduce((sum, point) => sum + point.x, 0) /
      solderPaste.points.length,
    y:
      solderPaste.points.reduce((sum, point) => sum + point.y, 0) /
      solderPaste.points.length,
  }
}

/** Creates an unnumbered, paste-only KiCad pad from an explicit aperture. */
export const createSolderPastePadFromCircuitJson = ({
  solderPaste,
  componentCenter,
  componentRotation = 0,
}: {
  solderPaste: PcbSolderPaste
  componentCenter: { x: number; y: number }
  componentRotation?: number
}): FootprintPad => {
  const polygonAnchor =
    solderPaste.shape === "polygon"
      ? getPolygonAnchor(solderPaste.points, solderPaste.holes)
      : undefined
  const center = polygonAnchor?.center ?? getSolderPasteCenter(solderPaste)
  const boardToFootprint = compose(
    componentRotation !== 0
      ? rotate((componentRotation * Math.PI) / 180)
      : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    scale(1, -1),
    translate(-componentCenter.x, -componentCenter.y),
  )
  const position = applyToPoint(boardToFootprint, center)

  let shape: string
  let size: [number, number]
  let rotation = 0
  let roundrectRatio: number | undefined
  let options: PadOptions | undefined
  let primitives: PadPrimitives | undefined

  switch (solderPaste.shape) {
    case "circle":
      shape = "circle"
      size = [solderPaste.radius * 2, solderPaste.radius * 2]
      break
    case "rect":
      shape = "rect"
      size = [solderPaste.width, solderPaste.height]
      break
    case "rotated_rect":
      shape = "rect"
      size = [solderPaste.width, solderPaste.height]
      rotation = solderPaste.ccw_rotation
      break
    case "oval":
      shape = "oval"
      size = [solderPaste.width, solderPaste.height]
      break
    case "pill":
      shape = "roundrect"
      size = [solderPaste.width, solderPaste.height]
      roundrectRatio =
        (solderPaste.radius ??
          Math.min(solderPaste.width, solderPaste.height) / 2) /
        Math.min(solderPaste.width, solderPaste.height)
      break
    case "rotated_pill":
      shape = "roundrect"
      size = [solderPaste.width, solderPaste.height]
      rotation = solderPaste.ccw_rotation
      roundrectRatio =
        (solderPaste.radius ??
          Math.min(solderPaste.width, solderPaste.height) / 2) /
        Math.min(solderPaste.width, solderPaste.height)
      break
    case "polygon": {
      if (!polygonAnchor) {
        throw new Error("Solder-paste polygon is missing its anchor geometry")
      }

      shape = "custom"
      const anchorDiameter = polygonAnchor.diameter
      size = [anchorDiameter, anchorDiameter]
      options = new PadOptions()
      options.anchor = "circle"

      const toLocalContour = (points: Array<{ x: number; y: number }>) =>
        new Pts(
          points.map((point) => {
            const localPoint = applyToPoint(
              compose(scale(1, -1), translate(-center.x, -center.y)),
              point,
            )
            return new Xy(localPoint.x, localPoint.y)
          }),
        )

      primitives = new PadPrimitives()
      const filledContours = solderPaste.holes?.length
        ? polygonAnchor.triangles
        : [solderPaste.points]

      // KiCad custom-pad primitives are additive. Triangulating apertures with
      // holes preserves the filled region without incorrectly filling a hole.
      for (const contour of filledContours) {
        const polygon = new PadPrimitiveGrPoly()
        polygon.contours = [toLocalContour(contour)]
        polygon.width = 0
        polygon.filled = true
        primitives.addGraphic(polygon)
      }
      break
    }
  }

  const layer = solderPaste.layer === "bottom" ? "B.Paste" : "F.Paste"
  const pad = new FootprintPad({
    number: "",
    padType: "smd",
    shape,
    at: [position.x, position.y, rotation],
    size,
    layers: [layer],
    roundrectRatio,
    uuid: generateDeterministicUuid(
      `solder_paste:${solderPaste.pcb_solder_paste_id}`,
    ),
  })

  if (options) pad.options = options
  if (primitives) pad.primitives = primitives

  return pad
}
