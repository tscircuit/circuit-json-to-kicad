import type { PcbCourtyardCircle } from "circuit-json"
import { FpCircle, Stroke } from "kicadts"
import { applyToPoint } from "transformation-matrix"
import {
  type FootprintGraphicsPlacement,
  getBoardToFootprintTransform,
} from "./get-board-to-footprint-transform"

export function convertCourtyardCircles(
  courtyardCircles: PcbCourtyardCircle[],
  placement: FootprintGraphicsPlacement,
): FpCircle[] {
  const fpCircles: FpCircle[] = []
  const boardToFootprintTransform = getBoardToFootprintTransform(placement)

  for (const circle of courtyardCircles) {
    const center = applyToPoint(boardToFootprintTransform, circle.center)

    const layerMap: Record<string, string> = {
      top: "F.CrtYd",
      bottom: "B.CrtYd",
    }
    const kicadLayer = layerMap[circle.layer] || "F.CrtYd"

    const fpCircle = new FpCircle({
      center,
      end: { x: center.x + circle.radius, y: center.y },
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
