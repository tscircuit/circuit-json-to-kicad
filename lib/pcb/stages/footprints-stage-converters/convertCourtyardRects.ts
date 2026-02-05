import type { PcbCourtyardRect } from "circuit-json"
import { FpRect, Stroke } from "kicadts"

export function convertCourtyardRects(
  courtyardRects: PcbCourtyardRect[],
  componentCenter: { x: number; y: number },
): FpRect[] {
  const fpRects: FpRect[] = []

  for (const rect of courtyardRects) {
    const relX = rect.center.x - componentCenter.x
    const relY = -(rect.center.y - componentCenter.y)
    const halfW = rect.width / 2
    const halfH = rect.height / 2

    const layerMap: Record<string, string> = {
      top: "F.CrtYd",
      bottom: "B.CrtYd",
    }
    const kicadLayer = layerMap[rect.layer] || "F.CrtYd"

    const fpRect = new FpRect({
      start: { x: relX - halfW, y: relY - halfH },
      end: { x: relX + halfW, y: relY + halfH },
      layer: kicadLayer,
      stroke: new Stroke(),
      fill: false,
    })

    if (fpRect.stroke) {
      fpRect.stroke.width = 0.05
      fpRect.stroke.type = "default"
    }

    fpRects.push(fpRect)
  }

  return fpRects
}
