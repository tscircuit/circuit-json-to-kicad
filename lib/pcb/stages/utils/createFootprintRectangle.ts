import type { PcbCourtyardRect } from "circuit-json"
import { FpPoly, FpRect, Pts, Stroke, Xy } from "kicadts"
import {
  applyToPoint,
  compose,
  rotateDEG,
  scale,
  translate,
} from "transformation-matrix"

export type FootprintRectangle = FpRect | FpPoly
export interface FootprintRectanglePlacement {
  componentCenter: { x: number; y: number }
  componentRotation?: number
}

/**
 * Circuit JSON rectangle centers are board-space mm (+Y up). Transform all
 * corners into footprint-local KiCad mm (+Y down), including the rectangle's
 * own CCW angle. KiCad fp_rect has no rotation field, so oblique local rectangles
 * need an unfilled four-point fp_poly.
 */
export function createFootprintRectangle({
  rectangle,
  componentCenter,
  componentRotation = 0,
  layer,
  strokeWidth,
}: FootprintRectanglePlacement & {
  rectangle: Pick<
    PcbCourtyardRect,
    "center" | "width" | "height" | "ccw_rotation"
  >
  layer: string
  strokeWidth: number
}): FootprintRectangle {
  // Legacy fabrication/note rectangles have no explicit angle and inherit
  // the footprint orientation. Preserve that behavior while correcting centers.
  const rectangleRotation = rectangle.ccw_rotation ?? componentRotation
  const rectangleToFootprint = compose(
    rotateDEG(componentRotation),
    scale(1, -1),
    translate(-componentCenter.x, -componentCenter.y),
    translate(rectangle.center.x, rectangle.center.y),
    rotateDEG(rectangleRotation),
  )
  const halfWidth = rectangle.width / 2
  const halfHeight = rectangle.height / 2
  const corners = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ].map((point) => applyToPoint(rectangleToFootprint, point))
  const stroke = new Stroke()
  stroke.width = strokeWidth
  stroke.type = "default"
  const localQuarterTurns = (rectangleRotation - componentRotation) / 90
  if (Math.abs(localQuarterTurns - Math.round(localQuarterTurns)) < 1e-9) {
    return new FpRect({
      start: {
        x: Math.min(...corners.map((p) => p.x)),
        y: Math.min(...corners.map((p) => p.y)),
      },
      end: {
        x: Math.max(...corners.map((p) => p.x)),
        y: Math.max(...corners.map((p) => p.y)),
      },
      layer,
      stroke,
      fill: false,
    })
  }
  const polygon = new FpPoly()
  polygon.points = new Pts(corners.map((point) => new Xy(point.x, point.y)))
  polygon.layer = layer
  polygon.stroke = stroke
  polygon.fill = false
  return polygon
}
