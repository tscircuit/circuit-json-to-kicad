import type { PcbSilkscreenCircle } from "circuit-json"
import { FpCircle, Stroke } from "kicadts"

export function convertSilkscreenCircles(
  silkscreenCircles: PcbSilkscreenCircle[],
  componentCenter: { x: number; y: number },
): FpCircle[] {
  const fpCircles: FpCircle[] = []

  for (const circle of silkscreenCircles) {
    const relX = circle.center.x - componentCenter.x
    const relY = -(circle.center.y - componentCenter.y)

    const layerMap: Record<string, string> = {
      top: "F.SilkS",
      bottom: "B.SilkS",
    }
    const kicadLayer = layerMap[circle.layer] || circle.layer || "F.SilkS"

    const fpCircle = new FpCircle({
      center: { x: relX, y: relY },
      end: { x: relX + circle.radius, y: relY },
      layer: kicadLayer,
      stroke: new Stroke(),
      fill: false,
    })

    if (fpCircle.stroke) {
      fpCircle.stroke.width = circle.stroke_width || 0.05
      fpCircle.stroke.type = "default"
    }

    fpCircles.push(fpCircle)
  }

  return fpCircles
}
