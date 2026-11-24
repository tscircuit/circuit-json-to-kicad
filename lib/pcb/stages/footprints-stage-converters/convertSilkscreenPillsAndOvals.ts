import type { PcbSilkscreenOval, PcbSilkscreenPill } from "circuit-json"
import { FpPoly, Stroke } from "kicadts"
import {
  applyToPoint,
  compose,
  rotate,
  scale,
  translate,
} from "transformation-matrix"
import { generateDeterministicUuid } from "../utils/generateDeterministicUuid"
import { getRectanglePoints } from "../utils/getRectanglePoints"

const DEFAULT_SILKSCREEN_STROKE_WIDTH = 0.1
const OVAL_SEGMENT_COUNT = 32

const dedupePolygonPoints = (
  points: Array<{ x: number; y: number }>,
): Array<{ x: number; y: number }> => {
  const deduped: Array<{ x: number; y: number }> = []
  for (const point of points) {
    const prev = deduped[deduped.length - 1]
    if (prev && Math.hypot(point.x - prev.x, point.y - prev.y) <= 1e-9) continue
    deduped.push(point)
  }
  while (
    deduped.length > 1 &&
    Math.hypot(
      deduped[0]!.x - deduped[deduped.length - 1]!.x,
      deduped[0]!.y - deduped[deduped.length - 1]!.y,
    ) <= 1e-9
  ) {
    deduped.pop()
  }
  return deduped
}

export function getSilkscreenPillBoardPoints(
  pill: PcbSilkscreenPill,
): Array<{ x: number; y: number }> {
  if (pill.width <= 0 || pill.height <= 0) return []
  const localPoints = dedupePolygonPoints(
    getRectanglePoints({
      width: pill.width,
      height: pill.height,
      corner_radius: Math.min(pill.width, pill.height) / 2,
    }),
  )
  const fromCenter = compose(
    translate(pill.center.x, pill.center.y),
    rotate(((pill.ccw_rotation ?? 0) * Math.PI) / 180),
  )
  return localPoints.map((point) => applyToPoint(fromCenter, point))
}

export function getSilkscreenOvalBoardPoints(
  oval: PcbSilkscreenOval,
): Array<{ x: number; y: number }> {
  if (oval.radius_x <= 0 || oval.radius_y <= 0) return []
  const fromCenter = compose(
    translate(oval.center.x, oval.center.y),
    rotate(((oval.ccw_rotation ?? 0) * Math.PI) / 180),
  )
  return Array.from({ length: OVAL_SEGMENT_COUNT }, (_, index) => {
    const angle = (index * Math.PI * 2) / OVAL_SEGMENT_COUNT
    return applyToPoint(fromCenter, {
      x: Math.cos(angle) * oval.radius_x,
      y: Math.sin(angle) * oval.radius_y,
    })
  })
}

export function convertSilkscreenPillsAndOvals({
  silkscreenPills = [],
  silkscreenOvals = [],
  componentCenter,
  componentRotation = 0,
}: {
  silkscreenPills?: PcbSilkscreenPill[]
  silkscreenOvals?: PcbSilkscreenOval[]
  componentCenter: { x: number; y: number }
  componentRotation?: number
}): FpPoly[] {
  const toLocal = compose(
    rotate((componentRotation * Math.PI) / 180),
    scale(1, -1),
    translate(-componentCenter.x, -componentCenter.y),
  )

  const pillPolys = silkscreenPills.flatMap((pill) => {
    const boardPoints = getSilkscreenPillBoardPoints(pill)
    if (boardPoints.length < 3) return []
    const stroke = new Stroke()
    stroke.width = DEFAULT_SILKSCREEN_STROKE_WIDTH
    stroke.type = "default"
    return [
      new FpPoly({
        points: boardPoints.map((point) => applyToPoint(toLocal, point)),
        layer: pill.layer === "bottom" ? "B.SilkS" : "F.SilkS",
        stroke,
        fill: false,
        uuid: generateDeterministicUuid(pill.pcb_silkscreen_pill_id),
      }),
    ]
  })

  const ovalPolys = silkscreenOvals.flatMap((oval) => {
    const boardPoints = getSilkscreenOvalBoardPoints(oval)
    if (boardPoints.length < 3) return []
    const stroke = new Stroke()
    stroke.width = DEFAULT_SILKSCREEN_STROKE_WIDTH
    stroke.type = "default"
    return [
      new FpPoly({
        points: boardPoints.map((point) => applyToPoint(toLocal, point)),
        layer: oval.layer === "bottom" ? "B.SilkS" : "F.SilkS",
        stroke,
        fill: false,
        uuid: generateDeterministicUuid(oval.pcb_silkscreen_oval_id),
      }),
    ]
  })

  return [...pillPolys, ...ovalPolys]
}
