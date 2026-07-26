import { SchematicSymbol } from "kicadts"
import {
  compose,
  scale as createScaleMatrix,
  translate,
} from "transformation-matrix"
import { createArcFromPrimitive } from "./createArcFromPrimitive"
import { createCircleFromPrimitive } from "./createCircleFromPrimitive"
import { createPolylineFromPoints } from "./createPolylineFromPoints"
import { createTextFromPrimitive } from "./createTextFromPrimitive"

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
  const transform = compose(
    createScaleMatrix(symbolScale, symbolScale),
    translate(-cx, -cy),
  )

  for (const primitive of symbolData.primitives || []) {
    if (primitive.type === "path" && primitive.points) {
      let fillType: "none" | "background" | "outline" = "none"
      if (primitive.fill) {
        fillType = "background"
        if (primitive.kicadFillType === "outline") {
          fillType = "outline"
        }
      }
      const polyline = createPolylineFromPoints({
        points: primitive.points,
        transform,
        fillType,
      })
      drawingSymbol.polylines.push(polyline)
    } else if (primitive.type === "circle") {
      const circle = createCircleFromPrimitive({
        primitive,
        transform,
        scale: symbolScale,
      })
      drawingSymbol.circles.push(circle)
    } else if (primitive.type === "arc") {
      const arc = createArcFromPrimitive({
        arc: primitive.arc,
        circuitJsonToKicadSymbolTransform: transform,
      })
      drawingSymbol.arcs.push(arc)
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
