import type { PcbSilkscreenRect } from "circuit-json"
import { FpPoly, Stroke } from "kicadts"
import {
  applyToPoint,
  compose,
  rotate,
  scale,
  translate,
} from "transformation-matrix"
import { generateDeterministicUuid } from "../utils/generateDeterministicUuid"

const getRectanglePoints = (rect: PcbSilkscreenRect) => {
  const halfWidth = rect.width / 2
  const halfHeight = rect.height / 2
  const radius = Math.min(
    Math.max(rect.corner_radius ?? 0, 0),
    halfWidth,
    halfHeight,
  )

  if (radius === 0) {
    return [
      { x: -halfWidth, y: -halfHeight },
      { x: halfWidth, y: -halfHeight },
      { x: halfWidth, y: halfHeight },
      { x: -halfWidth, y: halfHeight },
    ]
  }

  const corners = [
    { x: halfWidth - radius, y: halfHeight - radius, start: 0 },
    { x: -halfWidth + radius, y: halfHeight - radius, start: 90 },
    { x: -halfWidth + radius, y: -halfHeight + radius, start: 180 },
    { x: halfWidth - radius, y: -halfHeight + radius, start: 270 },
  ]

  return corners.flatMap((corner) =>
    Array.from({ length: 9 }, (_, index) => {
      const angle = ((corner.start + (index * 90) / 8) * Math.PI) / 180
      return {
        x: corner.x + radius * Math.cos(angle),
        y: corner.y + radius * Math.sin(angle),
      }
    }),
  )
}

export function convertSilkscreenRects({
  silkscreenRects,
  componentCenter,
  componentRotation = 0,
}: {
  silkscreenRects: PcbSilkscreenRect[]
  componentCenter: { x: number; y: number }
  componentRotation?: number
}): FpPoly[] {
  const toLocal = compose(
    rotate((componentRotation * Math.PI) / 180),
    scale(1, -1),
    translate(-componentCenter.x, -componentCenter.y),
  )

  return silkscreenRects.flatMap((rect) => {
    const hasStroke = rect.has_stroke ?? rect.stroke_width > 0
    if (!hasStroke && !rect.is_filled) return []

    const fromRectCenter = compose(
      translate(rect.center.x, rect.center.y),
      rotate(((rect.ccw_rotation ?? 0) * Math.PI) / 180),
    )
    const points = getRectanglePoints(rect).map((point) =>
      applyToPoint(toLocal, applyToPoint(fromRectCenter, point)),
    )
    const stroke = hasStroke ? new Stroke() : undefined
    if (stroke) {
      stroke.width = rect.stroke_width
      stroke.type = rect.is_stroke_dashed ? "dash" : "default"
    }

    return [
      new FpPoly({
        points,
        layer: rect.layer === "bottom" ? "B.SilkS" : "F.SilkS",
        stroke,
        fill: rect.is_filled ?? false,
        uuid: generateDeterministicUuid(rect.pcb_silkscreen_rect_id),
      }),
    ]
  })
}
