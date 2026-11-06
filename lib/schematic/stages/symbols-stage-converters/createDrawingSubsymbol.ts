import { SchematicSymbol } from "kicadts"
import {
  compose,
  scale as createScaleMatrix,
  translate,
} from "transformation-matrix"
import { parseColor } from "../utils/parseColor"
import { createArcFromPrimitive } from "./createArcFromPrimitive"
import { createCircleFromPrimitive } from "./createCircleFromPrimitive"
import { createPolylineFromPoints } from "./createPolylineFromPoints"
import { createRectangleFromPrimitive } from "./createRectangleFromPrimitive"
import { createTextFromPrimitive } from "./createTextFromPrimitive"

export function createDrawingSubsymbol({
  libId,
  symbolData,
  c2kMatSchScale,
}: {
  libId: string
  symbolData: any
  isChip?: boolean
  c2kMatSchScale: number
}): SchematicSymbol {
  const drawingSymbol = new SchematicSymbol({
    libraryId: `${libId.split(":")[1]}_0_1`,
  })

  const symbolScale = c2kMatSchScale
  const cx = symbolData.center?.x ?? 0
  const cy = symbolData.center?.y ?? 0
  const transform = compose(
    createScaleMatrix(symbolScale, symbolScale),
    translate(-cx, -cy),
  )

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
    } else if (
      primitive.type === "text" &&
      typeof primitive.text === "string" &&
      primitive.text.length > 0 &&
      primitive.text !== "{REF}" &&
      primitive.text !== "{VAL}"
    ) {
      drawingSymbol.texts.push(
        createTextFromPrimitive({
          schText: {
            text: primitive.text,
            x: primitive.x ?? 0,
            y: primitive.y ?? 0,
            fontSize: primitive.fontSize ?? 0.2,
            anchor: primitive.anchor,
          },
          transform,
          scale: symbolScale,
        }),
      )
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
