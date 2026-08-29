import { SymbolCircle } from "kicadts"
import { applyToPoint, type Matrix } from "transformation-matrix"
import { createSymbolFillSexprPrimitives } from "./createSymbolFillSexprPrimitives"

type CirclePrimitive = {
  x: number
  y: number
  radius: number
  fill?: boolean
  fillColor?: string
  kicadFillType?: "outline"
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
  const scaledPos = applyToPoint(transform, {
    x: primitive.x,
    y: primitive.y,
  })

  return SymbolCircle.fromSexprPrimitives([
    ["center", scaledPos.x, scaledPos.y],
    ["radius", primitive.radius * scale],
    ["stroke", ["width", 0.254], ["type", "default"]],
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
