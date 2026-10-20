import type { PcbFabricationNoteRect } from "circuit-json"
import { FpPoly, Stroke } from "kicadts"
import {
  applyToPoint,
  compose,
  rotate,
  scale,
  translate,
} from "transformation-matrix"

export function convertFabricationNoteRects(
  fabRects: PcbFabricationNoteRect[],
  componentCenter: { x: number; y: number },
  componentCcwRotationDegrees: number,
): FpPoly[] {
  const fpPolys: FpPoly[] = []
  // Circuit JSON rectangles are axis-aligned in Y-up board space (mm).
  // Undo the KiCad footprint placement to get Y-down local points (mm).
  const toLocal = compose(
    rotate((componentCcwRotationDegrees * Math.PI) / 180),
    scale(1, -1),
    translate(-componentCenter.x, -componentCenter.y),
  )

  for (const rect of fabRects) {
    const halfW = rect.width / 2
    const halfH = rect.height / 2

    const layerMap: Record<string, string> = {
      top: "F.Fab",
      bottom: "B.Fab",
    }
    const kicadLayer = layerMap[rect.layer] || rect.layer || "F.Fab"

    const fpPoly = new FpPoly({
      // Four corners also preserve the rectangle at non-cardinal rotations.
      points: [
        { x: rect.center.x - halfW, y: rect.center.y - halfH },
        { x: rect.center.x + halfW, y: rect.center.y - halfH },
        { x: rect.center.x + halfW, y: rect.center.y + halfH },
        { x: rect.center.x - halfW, y: rect.center.y + halfH },
      ].map((point) => applyToPoint(toLocal, point)),
      layer: kicadLayer,
      stroke: new Stroke(),
      fill: false,
    })

    if (fpPoly.stroke) {
      fpPoly.stroke.width = rect.stroke_width || 0.1
      fpPoly.stroke.type = "default"
    }

    fpPolys.push(fpPoly)
  }

  return fpPolys
}
