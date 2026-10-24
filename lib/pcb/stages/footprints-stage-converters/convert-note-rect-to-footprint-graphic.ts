import type { PcbFabricationNoteRect, PcbNoteRect } from "circuit-json"
import { FpPoly, FpRect, Stroke } from "kicadts"
import { applyToPoint, compose, translate } from "transformation-matrix"
import { generateDeterministicUuid } from "../utils/generateDeterministicUuid"
import {
  type FootprintGraphicsPlacement,
  getBoardToFootprintTransform,
} from "./get-board-to-footprint-transform"

/** Preserve the board-world corners of an axis-aligned note rectangle in mm. */
export function convertNoteRectToFootprintGraphic({
  rect,
  layer,
  footprintOrigin,
  ccwRotationDegrees = 0,
}: FootprintGraphicsPlacement & {
  rect: PcbNoteRect | PcbFabricationNoteRect
  layer: string
}): FpRect | FpPoly {
  const rectToFootprintTransform = compose(
    getBoardToFootprintTransform({ footprintOrigin, ccwRotationDegrees }),
    translate(rect.center.x, rect.center.y),
  )
  const halfWidth = rect.width / 2
  const halfHeight = rect.height / 2
  const corners = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ].map((point) => applyToPoint(rectToFootprintTransform, point))
  const stroke = new Stroke()
  stroke.width = rect.stroke_width || 0.1
  stroke.type = "default"

  // KiCad fp_rect is axis-aligned in footprint-local coordinates. At other
  // angles, preserve the four actual corners with an fp_poly.
  if (ccwRotationDegrees % 90 === 0) {
    return new FpRect({
      start: {
        x: Math.min(...corners.map((point) => point.x)),
        y: Math.min(...corners.map((point) => point.y)),
      },
      end: {
        x: Math.max(...corners.map((point) => point.x)),
        y: Math.max(...corners.map((point) => point.y)),
      },
      layer,
      stroke,
      fill: false,
    })
  }
  return new FpPoly({
    points: corners,
    layer,
    stroke,
    fill: false,
    uuid: generateDeterministicUuid(
      rect.type === "pcb_note_rect"
        ? rect.pcb_note_rect_id
        : rect.pcb_fabrication_note_rect_id,
    ),
  })
}
