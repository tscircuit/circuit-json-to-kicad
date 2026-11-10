import { SymbolArc } from "kicadts"
import type { Point } from "circuit-json"
import { roundSchematicCoordinate } from "../utils/schematicCoordinates"

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
  transform: (point: Point) => Point
  scale: number
}): SymbolArc {
  const start = transform(primitive.start)
  const mid = transform(primitive.mid)
  const end = transform(primitive.end)

  return SymbolArc.fromSexprPrimitives([
    ["start", start.x, start.y],
    ["mid", mid.x, mid.y],
    ["end", end.x, end.y],
    [
      "stroke",
      [
        "width",
        roundSchematicCoordinate(
          primitive.strokeWidth == null ? 0.254 : primitive.strokeWidth * scale,
        ),
      ],
      ["type", primitive.isDashed ? "dash" : "default"],
    ],
    ["fill", ["type", "none"]],
  ])
}
