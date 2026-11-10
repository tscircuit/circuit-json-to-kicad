import { Pts, Stroke, SymbolPolyline, SymbolPolylineFill, Xy } from "kicadts"
import type { Point } from "circuit-json"
import { roundSchematicCoordinate } from "../utils/schematicCoordinates"
import { createSymbolFillSexprPrimitives } from "./createSymbolFillSexprPrimitives"

export function createPolylineFromPoints({
  points,
  transform,
  isFilled,
  fillColor,
  fallbackFillType,
  strokeWidth,
  isDashed,
  scale,
}: {
  points: Array<{ x: number; y: number }>
  transform: (point: Point) => Point
  isFilled: boolean
  fillColor?: string
  fallbackFillType?: "background" | "outline"
  strokeWidth?: number | null
  isDashed?: boolean
  scale: number
}): SymbolPolyline {
  const polyline = new SymbolPolyline()

  const xyPoints = points.map((p) => {
    const transformed = transform(p)
    return new Xy(transformed.x, transformed.y)
  })
  const pts = new Pts(xyPoints)
  polyline.points = pts

  const stroke = new Stroke()
  stroke.width = roundSchematicCoordinate(
    strokeWidth == null ? 0.254 : strokeWidth * scale,
  )
  stroke.type = isDashed ? "dash" : "default"
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
