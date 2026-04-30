import type { PcbSilkscreenRect } from "circuit-json"
import { FpRect, Stroke } from "kicadts"
import { applyToPoint, identity, rotate } from "transformation-matrix"

interface ConvertSilkscreenRectsOptions {
  componentCenter: { x: number; y: number }
  componentRotation?: number
}

export function convertSilkscreenRects(
  silkscreenRects: PcbSilkscreenRect[],
  { componentCenter, componentRotation = 0 }: ConvertSilkscreenRectsOptions,
): FpRect[] {
  const fpRects: FpRect[] = []

  const rotationMatrix =
    componentRotation !== 0
      ? rotate((componentRotation * Math.PI) / 180)
      : identity()

  for (const rect of silkscreenRects) {
    const relX = rect.center.x - componentCenter.x
    const relY = -(rect.center.y - componentCenter.y)
    const halfW = rect.width / 2
    const halfH = rect.height / 2

    // Apply rotation to the rect center relative to footprint origin
    const rotatedCenter = applyToPoint(rotationMatrix, { x: relX, y: relY })

    const layerMap: Record<string, string> = {
      top: "F.SilkS",
      bottom: "B.SilkS",
    }
    const kicadLayer = layerMap[rect.layer] || "F.SilkS"

    const fpRect = new FpRect({
      start: { x: rotatedCenter.x - halfW, y: rotatedCenter.y - halfH },
      end: { x: rotatedCenter.x + halfW, y: rotatedCenter.y + halfH },
      layer: kicadLayer,
      stroke: new Stroke(),
      fill: rect.is_filled ?? false,
    })

    if (fpRect.stroke) {
      fpRect.stroke.width = rect.stroke_width ?? 0.12
      fpRect.stroke.type = "default"
    }

    fpRects.push(fpRect)
  }

  return fpRects
}
