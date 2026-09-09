import { SymbolRectangle } from "kicadts"
import { applyToPoint, type Matrix } from "transformation-matrix"
import { createSymbolFillSexprPrimitives } from "./createSymbolFillSexprPrimitives"

export function createRectangleFromPrimitive({
  primitive,
  transform,
  scale,
}: {
  primitive: {
    start: { x: number; y: number }
    end: { x: number; y: number }
    fill?: boolean
    fillColor?: string
    strokeWidth?: number | null
    isDashed?: boolean
  }
  transform: Matrix
  scale: number
}): SymbolRectangle {
  const start = applyToPoint(transform, primitive.start)
  const end = applyToPoint(transform, primitive.end)
  return SymbolRectangle.fromSexprPrimitives([
    ["start", start.x, start.y],
    ["end", end.x, end.y],
    [
      "stroke",
      [
        "width",
        primitive.strokeWidth == null ? 0.254 : primitive.strokeWidth * scale,
      ],
      ["type", primitive.isDashed ? "dash" : "default"],
    ],
    [
      "fill",
      ...createSymbolFillSexprPrimitives({
        isFilled: primitive.fill ?? false,
        fillColor: primitive.fillColor,
      }),
    ],
  ])
}
