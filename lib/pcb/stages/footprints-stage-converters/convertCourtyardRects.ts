import type { PcbCourtyardRect } from "circuit-json"
import {
  createFootprintRectangle,
  type FootprintRectangle,
  type FootprintRectanglePlacement,
} from "../utils/createFootprintRectangle"

export function convertCourtyardRects(
  courtyardRects: PcbCourtyardRect[],
  placement: FootprintRectanglePlacement,
): FootprintRectangle[] {
  return courtyardRects.map((rectangle) =>
    createFootprintRectangle({
      rectangle,
      ...placement,
      layer: rectangle.layer === "bottom" ? "B.CrtYd" : "F.CrtYd",
      strokeWidth: 0.05,
    }),
  )
}
