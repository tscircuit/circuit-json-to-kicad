import type { PcbSilkscreenPath } from "circuit-json"
import { FpLine, Stroke } from "kicadts"

export function convertSilkscreenPaths(
  silkscreenPaths: PcbSilkscreenPath[],
  componentCenter: { x: number; y: number },
): FpLine[] {
  const fpLines: FpLine[] = []

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

      const startRelX = startPoint.x - componentCenter.x
      const startRelY = -(startPoint.y - componentCenter.y)
      const endRelX = endPoint.x - componentCenter.x
      const endRelY = -(endPoint.y - componentCenter.y)

      const fpLine = new FpLine({
        start: { x: startRelX, y: startRelY },
        end: { x: endRelX, y: endRelY },
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
