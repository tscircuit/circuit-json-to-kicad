import type { PcbCourtyardOutline } from "circuit-json"
import { FpPoly, Pts, Xy, Stroke } from "kicadts"

export function convertCourtyardOutlines(
  courtyardOutlines: PcbCourtyardOutline[],
  componentCenter: { x: number; y: number },
): FpPoly[] {
  const fpPolys: FpPoly[] = []

  for (const outline of courtyardOutlines) {
    if (!outline.outline || outline.outline.length < 2) continue

    const layerMap: Record<string, string> = {
      top: "F.CrtYd",
      bottom: "B.CrtYd",
    }
    const kicadLayer = layerMap[outline.layer] || "F.CrtYd"

    const xyPoints = outline.outline.map((point) => {
      const relX = point.x - componentCenter.x
      const relY = -(point.y - componentCenter.y)
      return new Xy(relX, relY)
    })

    const fpPoly = new FpPoly()
    fpPoly.points = new Pts(xyPoints)
    fpPoly.layer = kicadLayer
    fpPoly.fill = false

    const stroke = new Stroke()
    stroke.width = 0.05
    stroke.type = "default"
    fpPoly.stroke = stroke

    fpPolys.push(fpPoly)
  }

  return fpPolys
}
