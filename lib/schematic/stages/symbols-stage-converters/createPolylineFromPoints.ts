import { Pts, Stroke, SymbolPolyline, SymbolPolylineFill, Xy } from "kicadts"
import type { Matrix } from "transformation-matrix"
import { applyToPointRounded } from "../utils/roundKicadCoord"

export function createPolylineFromPoints({
  points,
  transform,
  fillType,
}: {
  points: Array<{ x: number; y: number }>
  transform: Matrix
  fillType: "none" | "background" | "outline"
}): SymbolPolyline {
  const polyline = new SymbolPolyline()

  const xyPoints = points.map((p) => {
    const transformed = applyToPointRounded(transform, p)
    return new Xy(transformed.x, transformed.y)
  })
  const pts = new Pts(xyPoints)
  polyline.points = pts

  const stroke = new Stroke()
  stroke.width = 0.254
  stroke.type = "default"
  polyline.stroke = stroke

  const fill = new SymbolPolylineFill()
  fill.type = fillType
  polyline.fill = fill

  return polyline
}
