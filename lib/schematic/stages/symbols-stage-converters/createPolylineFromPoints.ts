import { Pts, Stroke, SymbolPolyline, SymbolPolylineFill, Xy } from "kicadts"
import { applyToPoint, type Matrix } from "transformation-matrix"
import { createSymbolFillSexprPrimitives } from "./createSymbolFillSexprPrimitives"

export function createPolylineFromPoints({
  points,
  transform,
  isFilled,
  fillColor,
  fallbackFillType,
  strokeWidth,
  scale,
}: {
  points: Array<{ x: number; y: number }>
  transform: Matrix
  isFilled: boolean
  fillColor?: string
  fallbackFillType?: "background" | "outline"
  strokeWidth?: number | null
  scale: number
}): SymbolPolyline {
  const polyline = new SymbolPolyline()

  const xyPoints = points.map((p) => {
    const transformed = applyToPoint(transform, p)
    return new Xy(transformed.x, transformed.y)
  })
  const pts = new Pts(xyPoints)
  polyline.points = pts

  const stroke = new Stroke()
  stroke.width = strokeWidth == null ? 0.254 : strokeWidth * scale
  stroke.type = "default"
  polyline.stroke = stroke

  const fill = SymbolPolylineFill.fromSexprPrimitives(
    createSymbolFillSexprPrimitives({
      isFilled,
      fillColor,
      fallbackFillType,
    }),
  )
  polyline.fill = fill

  return polyline
}
