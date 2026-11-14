import { SymbolRectangle } from "kicadts"
import type { Matrix } from "transformation-matrix"
import {
  roundSchematicCoordinate,
  transformSymbolPoint,
} from "../utils/schematicCoordinates"
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
  const start = transformSymbolPoint(transform, primitive.start)
  const end = transformSymbolPoint(transform, primitive.end)
  return SymbolRectangle.fromSexprPrimitives([
    ["start", start.x, start.y],
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
    [
      "fill",
      ...createSymbolFillSexprPrimitives({
        isFilled: primitive.fill ?? false,
        fillColor: primitive.fillColor,
      }),
    ],
  ])
}
