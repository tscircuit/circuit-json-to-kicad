import type { PcbSilkscreenRect } from "circuit-json"
import { FpRect, Stroke } from "kicadts"

export function convertSilkscreenRects(
  silkscreenRects: PcbSilkscreenRect[],
  componentCenter: { x: number; y: number },
): FpRect[] {
  const fpRects: FpRect[] = []

  for (const rect of silkscreenRects) {
    const relX = rect.center.x - componentCenter.x
    const relY = -(rect.center.y - componentCenter.y)
    const halfW = rect.width / 2
    const halfH = rect.height / 2

    const layerMap: Record<string, string> = {
      top: "F.SilkS",
      bottom: "B.SilkS",
    }
    const kicadLayer = layerMap[rect.layer] || rect.layer || "F.SilkS"

    const fpRect = new FpRect({
      start: { x: relX - halfW, y: relY - halfH },
      end: { x: relX + halfW, y: relY + halfH },
      layer: kicadLayer,
      stroke: new Stroke(),
      fill: false,
    })

    if (fpRect.stroke) {
      fpRect.stroke.width = rect.stroke_width ?? 0.05
      fpRect.stroke.type = "default"
    }

    fpRects.push(fpRect)
  }

  return fpRects
}
