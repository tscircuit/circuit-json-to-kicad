import type { PcbCourtyardCircle } from "circuit-json"
import { FpCircle, Stroke } from "kicadts"
import { applyToPoint, rotate } from "transformation-matrix"

export function convertCourtyardCircles(
  courtyardCircles: PcbCourtyardCircle[],
  componentCenter: { x: number; y: number },
  componentRotation = 0,
): FpCircle[] {
  const fpCircles: FpCircle[] = []
  const rotation = rotate((componentRotation * Math.PI) / 180)

  for (const circle of courtyardCircles) {
    const { x: relX, y: relY } = applyToPoint(rotation, {
      x: circle.center.x - componentCenter.x,
      y: -(circle.center.y - componentCenter.y),
    })

    const layerMap: Record<string, string> = {
      top: "F.CrtYd",
      bottom: "B.CrtYd",
    }
    const kicadLayer = layerMap[circle.layer] || "F.CrtYd"

    const fpCircle = new FpCircle({
      center: { x: relX, y: relY },
      end: { x: relX + circle.radius, y: relY },
      layer: kicadLayer,
      stroke: new Stroke(),
      fill: false,
    })

    if (fpCircle.stroke) {
      fpCircle.stroke.width = 0.05
      fpCircle.stroke.type = "default"
    }

    fpCircles.push(fpCircle)
  }

  return fpCircles
}
