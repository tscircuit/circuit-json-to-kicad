import type { PcbFabricationNotePath } from "circuit-json"
import { FpLine, Stroke } from "kicadts"
import { applyToPoint, identity, rotate } from "transformation-matrix"
import { parseColor } from "../../../schematic/stages/utils/parseColor"

interface ConvertFabricationNotePathsOptions {
  componentCenter: { x: number; y: number }
  componentRotation?: number
}

export function convertFabricationNotePaths(
  fabricationNotePaths: PcbFabricationNotePath[],
  {
    componentCenter,
    componentRotation = 0,
  }: ConvertFabricationNotePathsOptions,
): FpLine[] {
  const fpLines: FpLine[] = []
  const rotationMatrix =
    componentRotation !== 0
      ? rotate((componentRotation * Math.PI) / 180)
      : identity()

  for (const fabricationNotePath of fabricationNotePaths) {
    if (fabricationNotePath.route.length < 2) continue

    const pathWithStyle = fabricationNotePath as PcbFabricationNotePath & {
      stroke_type?: string
      is_stroke_dashed?: boolean
      color?: string
    }
    const isDashed =
      pathWithStyle.stroke_type === "dashed" ||
      Boolean(pathWithStyle.is_stroke_dashed)
    const parsedColor = pathWithStyle.color
      ? parseColor(pathWithStyle.color)
      : undefined

    const kicadLayer =
      fabricationNotePath.layer === "bottom" ? "B.Fab" : "F.Fab"

    for (let index = 0; index < fabricationNotePath.route.length - 1; index++) {
      const startPoint = fabricationNotePath.route[index]
      const endPoint = fabricationNotePath.route[index + 1]
      if (!startPoint || !endPoint) continue

      const startRelative = applyToPoint(rotationMatrix, {
        x: startPoint.x - componentCenter.x,
        y: -(startPoint.y - componentCenter.y),
      })
      const endRelative = applyToPoint(rotationMatrix, {
        x: endPoint.x - componentCenter.x,
        y: -(endPoint.y - componentCenter.y),
      })
      const stroke = new Stroke()
      stroke.width = fabricationNotePath.stroke_width || 0.1
      stroke.type = isDashed ? "dash" : "default"
      if (parsedColor) stroke.color = parsedColor

      fpLines.push(
        new FpLine({
          start: startRelative,
          end: endRelative,
          layer: kicadLayer,
          stroke,
        }),
      )
    }
  }

  return fpLines
}
