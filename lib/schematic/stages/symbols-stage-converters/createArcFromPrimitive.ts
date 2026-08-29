import { SymbolArc } from "kicadts"
import { applyToPoint, type Matrix } from "transformation-matrix"

export function createArcFromPrimitive({
  primitive,
  transform,
  scale,
}: {
  primitive: {
    start: { x: number; y: number }
    mid: { x: number; y: number }
    end: { x: number; y: number }
    isDashed?: boolean
    strokeWidth?: number | null
  }
  transform: Matrix
  scale: number
}): SymbolArc {
  const start = applyToPoint(transform, primitive.start)
  const mid = applyToPoint(transform, primitive.mid)
  const end = applyToPoint(transform, primitive.end)

  return SymbolArc.fromSexprPrimitives([
    ["start", start.x, start.y],
    ["mid", mid.x, mid.y],
    ["end", end.x, end.y],
    [
      "stroke",
      [
        "width",
        primitive.strokeWidth == null ? 0.254 : primitive.strokeWidth * scale,
      ],
      ["type", primitive.isDashed ? "dash" : "default"],
    ],
    ["fill", ["type", "none"]],
  ])
}
