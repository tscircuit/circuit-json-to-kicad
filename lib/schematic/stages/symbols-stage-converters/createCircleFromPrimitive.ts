import {
  Stroke,
  SymbolCircle,
  SymbolCircleCenter,
  SymbolCircleFill,
  SymbolCircleRadius,
} from "kicadts"
import { applyToPoint, type Matrix } from "transformation-matrix"

export function createCircleFromPrimitive({
  primitive,
  transform,
  scale,
}: {
  primitive: any
  transform: Matrix
  scale: number
}): SymbolCircle {
  const circle = new SymbolCircle()

  const scaledPos = applyToPoint(transform, {
    x: primitive.x,
    y: primitive.y,
  })

  const c = circle as any
  c._sxCenter = new SymbolCircleCenter(scaledPos.x, scaledPos.y)
  c._sxRadius = new SymbolCircleRadius(primitive.radius * scale)

  const stroke = new Stroke()
  stroke.width = 0.254
  stroke.type = "default"
  c._sxStroke = stroke

  const fill = new SymbolCircleFill()
  fill.type = primitive.fill ? "background" : "none"
  c._sxFill = fill

  return circle
}
