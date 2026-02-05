import type { PcbNoteRect } from "circuit-json"
import { FpRect, Stroke } from "kicadts"

export function convertNoteRects(
  noteRects: PcbNoteRect[],
  componentCenter: { x: number; y: number },
): FpRect[] {
  const fpRects: FpRect[] = []

  for (const rect of noteRects) {
    const relX = rect.center.x - componentCenter.x
    const relY = -(rect.center.y - componentCenter.y)
    const halfW = rect.width / 2
    const halfH = rect.height / 2

    const kicadLayer = "F.Fab"

    const fpRect = new FpRect({
      start: { x: relX - halfW, y: relY - halfH },
      end: { x: relX + halfW, y: relY + halfH },
      layer: kicadLayer,
      stroke: new Stroke(),
      fill: false,
    })

    if (fpRect.stroke) {
      fpRect.stroke.width = rect.stroke_width || 0.1
      fpRect.stroke.type = "default"
    }

    fpRects.push(fpRect)
  }

  return fpRects
}
