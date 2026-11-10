import { SymbolCircle } from "kicadts"
import type { Matrix } from "transformation-matrix"
import {
  roundSchematicCoordinate,
  transformSchematicPoint,
} from "../utils/schematicCoordinates"
import { createSymbolFillSexprPrimitives } from "./createSymbolFillSexprPrimitives"

type CirclePrimitive = {
  x: number
  y: number
  radius: number
  fill?: boolean
  fillColor?: string
  kicadFillType?: "outline"
  strokeWidth?: number | null
}

export function createCircleFromPrimitive({
  primitive,
  transform,
  scale,
}: {
  primitive: CirclePrimitive
  transform: Matrix
  scale: number
}): SymbolCircle {
  const scaledPos = transformSchematicPoint(transform, {
    x: primitive.x,
    y: primitive.y,
  })

  return SymbolCircle.fromSexprPrimitives([
    ["center", scaledPos.x, scaledPos.y],
    ["radius", roundSchematicCoordinate(primitive.radius * scale)],
    [
      "stroke",
      [
        "width",
        roundSchematicCoordinate(
          primitive.strokeWidth == null ? 0.254 : primitive.strokeWidth * scale,
        ),
      ],
      ["type", "default"],
    ],
    [
      "fill",
      ...createSymbolFillSexprPrimitives({
        isFilled: primitive.fill ?? false,
        fillColor: primitive.fillColor,
        fallbackFillType:
          primitive.kicadFillType === "outline" ? "outline" : "background",
      }),
    ],
  ])
}
