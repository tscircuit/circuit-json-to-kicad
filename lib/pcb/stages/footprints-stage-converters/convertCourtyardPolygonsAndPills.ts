import type { PcbCourtyardPill, PcbCourtyardPolygon } from "circuit-json"
import { FpPoly, Stroke } from "kicadts"
import {
  applyToPoint,
  compose,
  rotate,
  scale,
  translate,
} from "transformation-matrix"
import { parseColor } from "../../../schematic/stages/utils/parseColor"
import { generateDeterministicUuid } from "../utils/generateDeterministicUuid"
import { getRectanglePoints } from "../utils/getRectanglePoints"

const COURTYARD_STROKE_WIDTH = 0.05

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

export function convertCourtyardPolygons({
  courtyardPolygons,
  componentCenter,
  componentRotation = 0,
}: {
  courtyardPolygons: PcbCourtyardPolygon[]
  componentCenter: { x: number; y: number }
  componentRotation?: number
}): FpPoly[] {
  const toLocal = compose(
    rotate((componentRotation * Math.PI) / 180),
    scale(1, -1),
    translate(-componentCenter.x, -componentCenter.y),
  )

  return courtyardPolygons.flatMap((polygon) => {
    const cleanPoints = dedupePolygonPoints(polygon.points ?? [])
    if (cleanPoints.length < 3) return []

    const stroke = new Stroke()
    stroke.width = COURTYARD_STROKE_WIDTH
    stroke.type = "default"
    const color = polygon.color ? parseColor(polygon.color) : undefined
    if (color) stroke.color = color

    return [
      new FpPoly({
        points: cleanPoints.map((point) => applyToPoint(toLocal, point)),
        layer: polygon.layer === "bottom" ? "B.CrtYd" : "F.CrtYd",
        stroke,
        fill: false,
        uuid: generateDeterministicUuid(polygon.pcb_courtyard_polygon_id),
      }),
    ]
  })
}

export function convertCourtyardPills({
  courtyardPills,
  componentCenter,
  componentRotation = 0,
}: {
  courtyardPills: PcbCourtyardPill[]
  componentCenter: { x: number; y: number }
  componentRotation?: number
}): FpPoly[] {
  const toLocal = compose(
    rotate((componentRotation * Math.PI) / 180),
    scale(1, -1),
    translate(-componentCenter.x, -componentCenter.y),
  )

  return courtyardPills.flatMap((pill) => {
    if (pill.width <= 0 || pill.height <= 0) return []
    const localPoints = dedupePolygonPoints(
      getRectanglePoints({
        width: pill.width,
        height: pill.height,
        corner_radius: pill.radius,
      }),
    )
    if (localPoints.length < 3) return []

    const ccwRotation =
      (pill as PcbCourtyardPill & { ccw_rotation?: number }).ccw_rotation ?? 0
    const fromCenter = compose(
      translate(pill.center.x, pill.center.y),
      rotate((ccwRotation * Math.PI) / 180),
    )

    const stroke = new Stroke()
    stroke.width = COURTYARD_STROKE_WIDTH
    stroke.type = "default"
    const color = pill.color ? parseColor(pill.color) : undefined
    if (color) stroke.color = color

    return [
      new FpPoly({
        points: localPoints.map((point) =>
          applyToPoint(toLocal, applyToPoint(fromCenter, point)),
        ),
        layer: pill.layer === "bottom" ? "B.CrtYd" : "F.CrtYd",
        stroke,
        fill: false,
        uuid: generateDeterministicUuid(pill.pcb_courtyard_pill_id),
      }),
    ]
  })
}
