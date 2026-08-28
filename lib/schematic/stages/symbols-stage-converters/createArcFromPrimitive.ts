import { SymbolArc } from "kicadts"
import { applyToPoint, type Matrix } from "transformation-matrix"

export function createArcFromPrimitive({
  primitive,
  transform,
}: {
  primitive: {
    start: { x: number; y: number }
    mid: { x: number; y: number }
    end: { x: number; y: number }
    isDashed?: boolean
  }
  transform: Matrix
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
      ["width", 0.254],
      ["type", primitive.isDashed ? "dash" : "default"],
    ],
    ["fill", ["type", "none"]],
  ])
}
