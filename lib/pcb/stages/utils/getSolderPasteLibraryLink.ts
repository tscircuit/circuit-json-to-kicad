import type { PcbSolderPaste, Point } from "circuit-json"
import { generateDeterministicUuid } from "./generateDeterministicUuid"
import { getResolvedPillRadius } from "./getKicadNativePadGeometry"

const normalizePolygonPoints = (points: Point[], origin: Point): Point[] =>
  points.map((point) => ({
    x: point.x - origin.x,
    y: point.y - origin.y,
  }))

export const getSolderPasteLibraryLink = (paste: PcbSolderPaste): string => {
  const prefix = `tscircuit:solderpaste_${paste.layer}_${paste.shape}`

  switch (paste.shape) {
    case "circle":
      return `${prefix}_diameter${paste.radius * 2}mm`
    case "rect":
    case "oval":
      return `${prefix}_width${paste.width}mm_height${paste.height}mm`
    case "rotated_rect":
      return `${prefix}_width${paste.width}mm_height${paste.height}mm_ccwRotation${paste.ccw_rotation}deg`
    case "pill":
      return `${prefix}_width${paste.width}mm_height${paste.height}mm_radius${getResolvedPillRadius(paste)}mm`
    case "rotated_pill":
      return `${prefix}_width${paste.width}mm_height${paste.height}mm_radius${getResolvedPillRadius(paste)}mm_ccwRotation${paste.ccw_rotation}deg`
    case "polygon": {
      const origin = paste.points[0] ?? { x: 0, y: 0 }
      const geometry = JSON.stringify({
        points: normalizePolygonPoints(paste.points, origin),
        holes: paste.holes?.map((hole) => normalizePolygonPoints(hole, origin)),
      })
      return `${prefix}_${generateDeterministicUuid(geometry)}`
    }
  }
}
