import { SchematicSymbol } from "kicadts"
import { scale as createScaleMatrix } from "transformation-matrix"
import { createArcFromPrimitive } from "./createArcFromPrimitive"
import { createCircleFromPrimitive } from "./createCircleFromPrimitive"
import { createPolylineFromPoints } from "./createPolylineFromPoints"
import { createRectangleFromPrimitive } from "./createRectangleFromPrimitive"
import { createTextFromPrimitive } from "./createTextFromPrimitive"
import { parseColor } from "../utils/parseColor"

function toRelativeCoordinate(value: number, centerOffset: number): number {
  return centerOffset === 0 ? value : Number((value - centerOffset).toFixed(12))
}

function toRelativePoint(
  point: { x: number; y: number },
  cx: number,
  cy: number,
): { x: number; y: number } {
  return {
    x: toRelativeCoordinate(point.x, cx),
    y: toRelativeCoordinate(point.y, cy),
  }
}

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
  const transform = createScaleMatrix(symbolScale, symbolScale)

  for (const primitive of symbolData.primitives || []) {
    const strokeColor = primitive.color
      ? parseColor(primitive.color)
      : undefined
    if (strokeColor?.a === 0 && !primitive.fill) continue

    if (primitive.type === "arc") {
      drawingSymbol.arcs.push(
        createArcFromPrimitive({
          primitive: {
            ...primitive,
            start: toRelativePoint(primitive.start, cx, cy),
            mid: toRelativePoint(primitive.mid, cx, cy),
            end: toRelativePoint(primitive.end, cx, cy),
          },
          transform,
          scale: symbolScale,
        }),
      )
    } else if (primitive.type === "path" && primitive.points) {
      const polyline = createPolylineFromPoints({
        points: primitive.points.map((point: { x: number; y: number }) =>
          toRelativePoint(point, cx, cy),
        ),
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
          primitive: {
            ...primitive,
            start: toRelativePoint(primitive.start, cx, cy),
            end: toRelativePoint(primitive.end, cx, cy),
          },
          transform,
          scale: symbolScale,
        }),
      )
    } else if (primitive.type === "circle") {
      const circle = createCircleFromPrimitive({
        primitive: {
          ...primitive,
          x: toRelativeCoordinate(primitive.x, cx),
          y: toRelativeCoordinate(primitive.y, cy),
        },
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
      schText: {
        ...schText,
        x: toRelativeCoordinate(schText.x, cx),
        y: toRelativeCoordinate(schText.y, cy),
      },
      transform,
      scale: symbolScale,
    })
    drawingSymbol.texts.push(symbolText)
  }

  return drawingSymbol
}
