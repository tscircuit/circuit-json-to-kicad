import type { PcbFabricationNoteRect } from "circuit-json"
import { FpPoly, FpRect } from "kicadts"
import { convertNoteRectToFootprintGraphic } from "./convert-note-rect-to-footprint-graphic"
import type { FootprintGraphicsPlacement } from "./get-board-to-footprint-transform"

export function convertFabricationNoteRects(
  fabRects: PcbFabricationNoteRect[],
  placement: FootprintGraphicsPlacement,
): { fpRects: FpRect[]; fpPolys: FpPoly[] } {
  const fpRects: FpRect[] = []
  const fpPolys: FpPoly[] = []

  for (const rect of fabRects) {
    const layerMap: Record<string, string> = {
      top: "F.Fab",
      bottom: "B.Fab",
    }
    const kicadLayer = layerMap[rect.layer] || rect.layer || "F.Fab"

    const graphic = convertNoteRectToFootprintGraphic({
      rect,
      layer: kicadLayer,
      ...placement,
    })
    if (graphic instanceof FpRect) fpRects.push(graphic)
    else fpPolys.push(graphic)
  }

  return { fpRects, fpPolys }
}
