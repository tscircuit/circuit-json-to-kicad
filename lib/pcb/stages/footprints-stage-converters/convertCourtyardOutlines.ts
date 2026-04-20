import type { PcbCourtyardOutline } from "circuit-json"
import { FpPoly, Pts, Stroke, Xy } from "kicadts"
import {
  applyToPoint,
  compose,
  rotate,
  scale,
  translate,
} from "transformation-matrix"
import { generateDeterministicUuid } from "../utils/generateDeterministicUuid"

export function convertCourtyardOutlines(
  courtyardOutlines: PcbCourtyardOutline[],
  componentCenter: { x: number; y: number },
  componentRotation = 0,
): FpPoly[] {
  const fpPolys: FpPoly[] = []

  const cj2kicadMatrix = compose(
    componentRotation !== 0
      ? rotate((componentRotation * Math.PI) / 180)
      : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    scale(1, -1),
    translate(-componentCenter.x, -componentCenter.y),
  )

  for (const outline of courtyardOutlines) {
    if (!outline.outline || outline.outline.length < 2) continue

    const layerMap: Record<string, string> = {
      top: "F.CrtYd",
      bottom: "B.CrtYd",
    }
    const kicadLayer = layerMap[outline.layer] || "F.CrtYd"

    const xyPoints = outline.outline.map((point) => {
      const transformedPoint = applyToPoint(cj2kicadMatrix, point)
      return new Xy(transformedPoint.x, transformedPoint.y)
    })

    const fpPoly = new FpPoly()
    fpPoly.points = new Pts(xyPoints)
    fpPoly.layer = kicadLayer
    fpPoly.fill = false
    fpPoly.uuid = generateDeterministicUuid(outline.pcb_courtyard_outline_id)

    const stroke = new Stroke()
    stroke.width = 0.05
    stroke.type = "default"
    fpPoly.stroke = stroke

    fpPolys.push(fpPoly)
  }

  return fpPolys
}
