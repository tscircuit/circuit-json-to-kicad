import type { PcbSilkscreenCircle } from "circuit-json"
import { FpCircle, Stroke } from "kicadts"
import { applyToPoint, identity, rotate } from "transformation-matrix"
import { parseColor } from "../../../schematic/stages/utils/parseColor"
import { generateDeterministicUuid } from "../utils/generateDeterministicUuid"

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
    const circleWithStyle = circle as PcbSilkscreenCircle & {
      is_filled?: boolean
      has_stroke?: boolean
      is_stroke_dashed?: boolean
      color?: string
    }
    const isFilled = Boolean(circleWithStyle.is_filled)
    const hasStroke =
      circleWithStyle.has_stroke ??
      (circle.stroke_width !== undefined ? circle.stroke_width > 0 : !isFilled)

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
      fill: isFilled,
      uuid: circle.pcb_silkscreen_circle_id
        ? generateDeterministicUuid(circle.pcb_silkscreen_circle_id)
        : undefined,
    })

    if (fpCircle.stroke) {
      fpCircle.stroke.width = hasStroke ? circle.stroke_width || 0.05 : 0
      fpCircle.stroke.type = circleWithStyle.is_stroke_dashed
        ? "dash"
        : "default"
      const parsedColor = circleWithStyle.color
        ? parseColor(circleWithStyle.color)
        : undefined
      if (parsedColor) fpCircle.stroke.color = parsedColor
    }

    fpCircles.push(fpCircle)
  }

  return fpCircles
}
