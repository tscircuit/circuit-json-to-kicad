import type { PcbNoteRect } from "circuit-json"
import {
  createFootprintRectangle,
  type FootprintRectangle,
  type FootprintRectanglePlacement,
} from "../utils/createFootprintRectangle"

export function convertNoteRects(
  noteRects: PcbNoteRect[],
  placement: FootprintRectanglePlacement,
): FootprintRectangle[] {
  return noteRects.map((rectangle) =>
    createFootprintRectangle({
      rectangle,
      ...placement,
      layer: rectangle.layer === "bottom" ? "B.Fab" : "F.Fab",
      strokeWidth: rectangle.stroke_width || 0.1,
    }),
  )
}
