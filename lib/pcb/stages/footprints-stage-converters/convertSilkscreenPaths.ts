import type { PcbSilkscreenPath } from "circuit-json"
import { FpLine, Stroke } from "kicadts"
import { applyToPoint, identity, rotate } from "transformation-matrix"

export function convertSilkscreenPaths(
  silkscreenPaths: PcbSilkscreenPath[],
  componentCenter: { x: number; y: number },
  componentRotation = 0,
): FpLine[] {
  const fpLines: FpLine[] = []

  const rotationMatrix =
    componentRotation !== 0
      ? rotate((componentRotation * Math.PI) / 180)
      : identity()

  for (const path of silkscreenPaths) {
    if (!path.route || path.route.length < 2) continue

    const layerMap: Record<string, string> = {
      top: "F.SilkS",
      bottom: "B.SilkS",
    }
    const kicadLayer = layerMap[path.layer] || path.layer || "F.SilkS"

    for (let i = 0; i < path.route.length - 1; i++) {
      const startPoint = path.route[i]
      const endPoint = path.route[i + 1]

      if (!startPoint || !endPoint) continue

      const startRelative = applyToPoint(rotationMatrix, {
        x: startPoint.x - componentCenter.x,
        y: -(startPoint.y - componentCenter.y),
      })
      const endRelative = applyToPoint(rotationMatrix, {
        x: endPoint.x - componentCenter.x,
        y: -(endPoint.y - componentCenter.y),
      })

      const fpLine = new FpLine({
        start: { x: startRelative.x, y: startRelative.y },
        end: { x: endRelative.x, y: endRelative.y },
        layer: kicadLayer,
        stroke: new Stroke(),
      })

      if (fpLine.stroke) {
        fpLine.stroke.width = path.stroke_width || 0.15
        fpLine.stroke.type = "default"
      }

      fpLines.push(fpLine)
    }
  }

  return fpLines
}
