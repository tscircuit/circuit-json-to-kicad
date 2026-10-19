import type { PcbCourtyardRect } from "circuit-json"
import { FpPoly, FpRect, Stroke } from "kicadts"
import {
  applyToPoint,
  compose,
  rotate,
  scale,
  translate,
} from "transformation-matrix"
import { parseColor } from "../../../utils/parseColor"
import { generateDeterministicUuid } from "../utils/generateDeterministicUuid"

export function convertCourtyardRects({
  courtyardRects,
  componentCenter,
  componentRotation = 0,
}: {
  courtyardRects: PcbCourtyardRect[]
  componentCenter: { x: number; y: number }
  componentRotation?: number
}): { fpRects: FpRect[]; fpPolys: FpPoly[] } {
  const fpRects: FpRect[] = []
  const fpPolys: FpPoly[] = []
  const toLocal = compose(
    rotate((componentRotation * Math.PI) / 180),
    scale(1, -1),
    translate(-componentCenter.x, -componentCenter.y),
  )

  for (const rect of courtyardRects) {
    const halfW = rect.width / 2
    const halfH = rect.height / 2
    const rotation = rect.ccw_rotation ?? 0
    const fromRectCenter = compose(
      translate(rect.center.x, rect.center.y),
      rotate((rotation * Math.PI) / 180),
    )
    const points = [
      { x: -halfW, y: -halfH },
      { x: halfW, y: -halfH },
      { x: halfW, y: halfH },
      { x: -halfW, y: halfH },
    ].map((point) => applyToPoint(toLocal, applyToPoint(fromRectCenter, point)))
    const layer = rect.layer === "bottom" ? "B.CrtYd" : "F.CrtYd"
    const stroke = new Stroke()
    stroke.width = 0.05
    stroke.type = "default"
    const color = rect.color ? parseColor(rect.color) : undefined
    if (color) stroke.color = color

    // KiCad rectangles are axis-aligned in footprint coordinates. Other
    // angles need a polygon to preserve all four corners, not a bounding box.
    if ((rotation - componentRotation) % 90 === 0) {
      fpRects.push(
        new FpRect({
          start: {
            x: Math.min(...points.map((point) => point.x)),
            y: Math.min(...points.map((point) => point.y)),
          },
          end: {
            x: Math.max(...points.map((point) => point.x)),
            y: Math.max(...points.map((point) => point.y)),
          },
          layer,
          stroke,
          fill: false,
        }),
      )
    } else {
      fpPolys.push(
        new FpPoly({
          points,
          layer,
          stroke,
          fill: false,
          uuid: generateDeterministicUuid(rect.pcb_courtyard_rect_id),
        }),
      )
    }
  }

  return { fpRects, fpPolys }
}
