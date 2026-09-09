import type { PcbSilkscreenCircle } from "circuit-json"
import { FpCircle, Stroke } from "kicadts"
import { applyToPoint, identity, rotate } from "transformation-matrix"

interface ConvertSilkscreenCirclesOptions {
  componentCenter: { x: number; y: number }
  componentRotation?: number
}

export function convertSilkscreenCircles(
  silkscreenCircles: PcbSilkscreenCircle[],
  { componentCenter, componentRotation = 0 }: ConvertSilkscreenCirclesOptions,
): FpCircle[] {
  const fpCircles: FpCircle[] = []
  const rotationMatrix =
    componentRotation !== 0
      ? rotate((componentRotation * Math.PI) / 180)
      : identity()

  for (const circle of silkscreenCircles) {
    const relativeCenter = applyToPoint(rotationMatrix, {
      x: circle.center.x - componentCenter.x,
      y: -(circle.center.y - componentCenter.y),
    })

    const layerMap: Record<string, string> = {
      top: "F.SilkS",
      bottom: "B.SilkS",
    }
    const kicadLayer = layerMap[circle.layer] || circle.layer || "F.SilkS"

    const fpCircle = new FpCircle({
      center: relativeCenter,
      end: { x: relativeCenter.x + circle.radius, y: relativeCenter.y },
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
