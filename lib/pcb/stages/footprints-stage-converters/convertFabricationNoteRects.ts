import type { PcbFabricationNoteRect } from "circuit-json"
import {
  createFootprintRectangle,
  type FootprintRectangle,
  type FootprintRectanglePlacement,
} from "../utils/createFootprintRectangle"

export function convertFabricationNoteRects(
  fabRects: PcbFabricationNoteRect[],
  placement: FootprintRectanglePlacement,
): FootprintRectangle[] {
  return fabRects.map((rectangle) =>
    createFootprintRectangle({
      rectangle,
      ...placement,
      layer: rectangle.layer === "bottom" ? "B.Fab" : "F.Fab",
      strokeWidth: rectangle.stroke_width || 0.1,
    }),
  )
}
