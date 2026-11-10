import { SchematicSymbol } from "kicadts"
import Big from "big.js"
import type { Point } from "circuit-json"
import { createArcFromPrimitive } from "./createArcFromPrimitive"
import { createCircleFromPrimitive } from "./createCircleFromPrimitive"
import { createPolylineFromPoints } from "./createPolylineFromPoints"
import { createRectangleFromPrimitive } from "./createRectangleFromPrimitive"
import { createTextFromPrimitive } from "./createTextFromPrimitive"
import { parseColor } from "../utils/parseColor"

export function createDrawingSubsymbol({
  libId,
  symbolData,
  isChip,
  c2kMatSchScale,
}: {
  libId: string
  symbolData: any
  isChip: boolean
  c2kMatSchScale: number
}): SchematicSymbol {
  const drawingSymbol = new SchematicSymbol({
    libraryId: `${libId.split(":")[1]}_0_1`,
  })

  const symbolScale = c2kMatSchScale
  const cx = symbolData.center?.x ?? 0
  const cy = symbolData.center?.y ?? 0
  // Operate on the decimal values represented in Circuit JSON. Subtract and
  // scale exactly, then round once to KiCad's 0.0001 mm grid (ties away from
  // zero). A precomposed binary64 matrix loses precision before this rounding.
  const transform = ({ x, y }: Point): Point => ({
    x: new Big(x.toString())
      .minus(cx.toString())
      .times(symbolScale.toString())
      .round(4, Big.roundHalfUp)
      .toNumber(),
    y: new Big(y.toString())
      .minus(cy.toString())
      .times(symbolScale.toString())
      .round(4, Big.roundHalfUp)
      .toNumber(),
  })

  for (const primitive of symbolData.primitives || []) {
    const strokeColor = primitive.color
      ? parseColor(primitive.color)
      : undefined
    if (strokeColor?.a === 0 && !primitive.fill) continue

    if (primitive.type === "arc") {
      drawingSymbol.arcs.push(
        createArcFromPrimitive({
          primitive,
          transform,
          scale: symbolScale,
        }),
      )
    } else if (primitive.type === "path" && primitive.points) {
      const polyline = createPolylineFromPoints({
        points: primitive.points,
        transform,
        isFilled: primitive.fill ?? false,
        fillColor: primitive.fillColor,
        fallbackFillType:
          primitive.kicadFillType === "outline" ? "outline" : "background",
        strokeWidth: primitive.strokeWidth,
        isDashed: primitive.isDashed,
        scale: symbolScale,
      })
      drawingSymbol.polylines.push(polyline)
    } else if (primitive.type === "rectangle") {
      drawingSymbol.rectangles.push(
        createRectangleFromPrimitive({
          primitive,
          transform,
          scale: symbolScale,
        }),
      )
    } else if (primitive.type === "circle") {
      const circle = createCircleFromPrimitive({
        primitive,
        transform,
        scale: symbolScale,
      })
      drawingSymbol.circles.push(circle)
    }
  }

  // Convert text primitives to KiCad SymbolText elements
  const textsArray = Array.isArray(symbolData.texts) ? symbolData.texts : []
  for (const schText of textsArray) {
    const symbolText = createTextFromPrimitive({
      schText,
      transform,
      scale: symbolScale,
    })
    drawingSymbol.texts.push(symbolText)
  }

  return drawingSymbol
}
