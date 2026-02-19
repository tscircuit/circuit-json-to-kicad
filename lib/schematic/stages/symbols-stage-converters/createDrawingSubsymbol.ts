import { SchematicSymbol } from "kicadts"
import {
  compose,
  scale as createScaleMatrix,
  translate,
} from "transformation-matrix"
import { createPolylineFromPoints } from "./createPolylineFromPoints"
import { createCircleFromPrimitive } from "./createCircleFromPrimitive"
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

  // Chips use c2kMatSchScale to match page layout.
  // Non-chip symbols stay in mm; pin endpoints are snapped to 1.27mm grid separately.
  const symbolScale = isChip ? c2kMatSchScale : 1
  const cx = symbolData.center?.x ?? 0
  const cy = symbolData.center?.y ?? 0
  const transform = compose(
    createScaleMatrix(symbolScale, symbolScale),
    translate(-cx, -cy),
  )

  for (const primitive of symbolData.primitives || []) {
    if (primitive.type === "path" && primitive.points) {
      const fillType = isChip || primitive.fill ? "background" : "none"
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
