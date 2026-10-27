import type { PcbNoteRect } from "circuit-json"
import { FpPoly, FpRect } from "kicadts"
import { convertNoteRectToFootprintGraphic } from "./convert-note-rect-to-footprint-graphic"
import type { FootprintGraphicsPlacement } from "./get-board-to-footprint-transform"

export function convertNoteRects(
  noteRects: PcbNoteRect[],
  placement: FootprintGraphicsPlacement,
): { fpRects: FpRect[]; fpPolys: FpPoly[] } {
  const fpRects: FpRect[] = []
  const fpPolys: FpPoly[] = []

  for (const rect of noteRects) {
    const graphic = convertNoteRectToFootprintGraphic({
      rect,
      layer: "F.Fab",
      ...placement,
    })
    if (graphic instanceof FpRect) fpRects.push(graphic)
    else fpPolys.push(graphic)
  }

  return { fpRects, fpPolys }
}
