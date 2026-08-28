import type { KicadSch, RGBAColor } from "kicadts"
import {
  Polyline,
  Pts,
  SchematicRectangle,
  SchematicText,
  Stroke,
  SymbolRectangleFill,
  TextEffects,
  TextEffectsFont,
  TextEffectsJustify,
  Uuid,
  Xy,
} from "kicadts"
import SVGPathCommander, { type PathArray } from "svg-path-commander"
import { type INode, parseSync } from "svgson"

interface PaperSize {
  width: number
  height: number
}

interface SvgTransform {
  scale: number
  offsetX: number
  offsetY: number
}

interface SvgPoint {
  x: number
  y: number
}

interface KicadGraphicCollections {
  polylines: Polyline[]
  rectangles: SchematicRectangle[]
  texts: SchematicText[]
}

const SVG_PAPER_MARGIN_MM = 10
const CURVE_SEGMENTS = 12
const CIRCLE_SEGMENTS = 24
const DEFAULT_STROKE_WIDTH_PX = 1
const DEFAULT_FONT_SIZE_PX = 12
const SVG_TO_KICAD_FONT_HEIGHT_RATIO = 0.55
const SVG_TO_KICAD_FONT_WIDTH_RATIO = 0.8

const parseNumber = (value: string | undefined, fallback = 0): number => {
  const parsed = Number.parseFloat(value ?? "")
  return Number.isFinite(parsed) ? parsed : fallback
}

const parseColor = (value: string | undefined): RGBAColor | undefined => {
  if (!value || value === "none" || value === "transparent") return undefined

  const hexMatch = value.match(/^#([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i)
  if (hexMatch) {
    let hex = hexMatch[1]!
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((character) => character.repeat(2))
        .join("")
    }
    const hasAlpha = hex.length === 8
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
      a: hasAlpha ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
    }
  }

  const rgbMatch = value.match(
    /^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i,
  )
  if (rgbMatch) {
    return {
      r: parseNumber(rgbMatch[1]),
      g: parseNumber(rgbMatch[2]),
      b: parseNumber(rgbMatch[3]),
      a: parseNumber(rgbMatch[4], 1),
    }
  }

  return undefined
}

const transformPoint = (
  point: SvgPoint,
  transform: SvgTransform,
): SvgPoint => ({
  x: transform.offsetX + point.x * transform.scale,
  y: transform.offsetY + point.y * transform.scale,
})

const createStroke = (
  color: RGBAColor,
  widthPx: number,
  scale: number,
): Stroke => {
  const stroke = new Stroke()
  stroke.width = Math.max(widthPx * scale, 0.1)
  stroke.type = "default"
  stroke.color = color
  return stroke
}

const getNodeStroke = (
  node: INode,
  transform: SvgTransform,
): Stroke | undefined => {
  const strokeColor = parseColor(node.attributes.stroke)
  if (strokeColor) {
    return createStroke(
      strokeColor,
      parseNumber(node.attributes["stroke-width"], DEFAULT_STROKE_WIDTH_PX),
      transform.scale,
    )
  }

  const fillColor = parseColor(node.attributes.fill)
  if (!fillColor) return undefined
  return createStroke(fillColor, DEFAULT_STROKE_WIDTH_PX, transform.scale)
}

const createPolyline = (
  points: SvgPoint[],
  stroke: Stroke,
  transform: SvgTransform,
): Polyline | undefined => {
  if (points.length < 2) return undefined
  return new Polyline({
    points: new Pts(
      points.map((point) => {
        const transformed = transformPoint(point, transform)
        return new Xy(transformed.x, transformed.y)
      }),
    ),
    stroke,
    uuid: new Uuid(crypto.randomUUID()),
  })
}

const sampleCubic = (
  start: SvgPoint,
  control1: SvgPoint,
  control2: SvgPoint,
  end: SvgPoint,
): SvgPoint[] => {
  const points: SvgPoint[] = []
  for (let index = 1; index <= CURVE_SEGMENTS; index += 1) {
    const t = index / CURVE_SEGMENTS
    const inverseT = 1 - t
    points.push({
      x:
        inverseT ** 3 * start.x +
        3 * inverseT ** 2 * t * control1.x +
        3 * inverseT * t ** 2 * control2.x +
        t ** 3 * end.x,
      y:
        inverseT ** 3 * start.y +
        3 * inverseT ** 2 * t * control1.y +
        3 * inverseT * t ** 2 * control2.y +
        t ** 3 * end.y,
    })
  }
  return points
}

const samplePath = (path: PathArray): SvgPoint[] => {
  const curve = SVGPathCommander.pathToCurve(path)
  const move = curve[0]
  const points: SvgPoint[] = [{ x: move[1], y: move[2] }]
  let currentPoint = points[0]!

  for (const segment of curve.slice(1)) {
    if (segment[0] !== "C") continue
    const end = { x: segment[5], y: segment[6] }
    points.push(
      ...sampleCubic(
        currentPoint,
        { x: segment[1], y: segment[2] },
        { x: segment[3], y: segment[4] },
        end,
      ),
    )
    currentPoint = end
  }

  return points
}

const createArrowhead = (
  pathPoints: SvgPoint[],
  stroke: Stroke,
  transform: SvgTransform,
): Polyline | undefined => {
  const end = pathPoints.at(-1)
  const previous = pathPoints.at(-2)
  if (!end || !previous) return undefined

  const angle = Math.atan2(end.y - previous.y, end.x - previous.x)
  const length = 9
  const halfWidth = 5
  const baseCenter = {
    x: end.x - Math.cos(angle) * length,
    y: end.y - Math.sin(angle) * length,
  }
  const perpendicular = { x: -Math.sin(angle), y: Math.cos(angle) }
  const left = {
    x: baseCenter.x + perpendicular.x * halfWidth,
    y: baseCenter.y + perpendicular.y * halfWidth,
  }
  const right = {
    x: baseCenter.x - perpendicular.x * halfWidth,
    y: baseCenter.y - perpendicular.y * halfWidth,
  }

  return createPolyline([end, left, right, end], stroke, transform)
}

const getTextContent = (node: INode): string =>
  node.type === "text" ? node.value : node.children.map(getTextContent).join("")

const addText = (
  node: INode,
  transform: SvgTransform,
  graphics: KicadGraphicCollections,
): void => {
  const value = getTextContent(node).trim()
  if (!value) return

  const fontSizePx = parseNumber(
    node.attributes["font-size"],
    DEFAULT_FONT_SIZE_PX,
  )
  const font = new TextEffectsFont()
  font.size = {
    height: fontSizePx * transform.scale * SVG_TO_KICAD_FONT_HEIGHT_RATIO,
    width:
      fontSizePx *
      transform.scale *
      SVG_TO_KICAD_FONT_HEIGHT_RATIO *
      SVG_TO_KICAD_FONT_WIDTH_RATIO,
  }
  font.color = parseColor(node.attributes.fill)
  const fontWeight = node.attributes["font-weight"]
  font.bold = fontWeight === "bold" || parseNumber(fontWeight) >= 600

  const textAnchor = node.attributes["text-anchor"]
  const justify = new TextEffectsJustify({
    horizontal:
      textAnchor === "end"
        ? "right"
        : textAnchor === "middle"
          ? undefined
          : "left",
    vertical: "bottom",
  })
  const position = transformPoint(
    {
      x: parseNumber(node.attributes.x),
      y: parseNumber(node.attributes.y),
    },
    transform,
  )

  graphics.texts.push(
    new SchematicText({
      value,
      at: [position.x, position.y, 0],
      excludeFromSim: false,
      effects: new TextEffects({ font, hiddenText: false, justify }),
      uuid: new Uuid(crypto.randomUUID()),
    }),
  )
}

const addRectangle = (
  node: INode,
  transform: SvgTransform,
  graphics: KicadGraphicCollections,
): void => {
  const stroke = getNodeStroke(node, transform)
  if (!stroke) return

  const start = transformPoint(
    {
      x: parseNumber(node.attributes.x),
      y: parseNumber(node.attributes.y),
    },
    transform,
  )
  const end = transformPoint(
    {
      x: parseNumber(node.attributes.x) + parseNumber(node.attributes.width),
      y: parseNumber(node.attributes.y) + parseNumber(node.attributes.height),
    },
    transform,
  )
  const fill = new SymbolRectangleFill()
  fill.type = "none"
  graphics.rectangles.push(
    new SchematicRectangle({
      start,
      end,
      stroke,
      fill,
      uuid: new Uuid(crypto.randomUUID()),
    }),
  )
}

const addCircle = (
  node: INode,
  transform: SvgTransform,
  graphics: KicadGraphicCollections,
): void => {
  const stroke = getNodeStroke(node, transform)
  if (!stroke) return

  const center = {
    x: parseNumber(node.attributes.cx),
    y: parseNumber(node.attributes.cy),
  }
  const radius = parseNumber(node.attributes.r)
  const points = Array.from({ length: CIRCLE_SEGMENTS + 1 }, (_, index) => {
    const angle = (index / CIRCLE_SEGMENTS) * Math.PI * 2
    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    }
  })
  const polyline = createPolyline(points, stroke, transform)
  if (polyline) graphics.polylines.push(polyline)
}

const addPath = (
  node: INode,
  transform: SvgTransform,
  graphics: KicadGraphicCollections,
): void => {
  const pathData = node.attributes.d
  const stroke = getNodeStroke(node, transform)
  if (!pathData || !stroke) return

  for (const subpath of SVGPathCommander.splitPath(pathData)) {
    const pathPoints = samplePath(subpath)
    const polyline = createPolyline(pathPoints, stroke, transform)
    if (polyline) graphics.polylines.push(polyline)

    if (node.attributes["marker-end"]) {
      const arrowhead = createArrowhead(pathPoints, stroke, transform)
      if (arrowhead) graphics.polylines.push(arrowhead)
    }
  }
}

const addSvgNode = (
  node: INode,
  transform: SvgTransform,
  graphics: KicadGraphicCollections,
): void => {
  if (node.name === "defs" || node.name === "title" || node.name === "desc") {
    return
  }

  if (node.name === "text") addText(node, transform, graphics)
  if (node.name === "rect") addRectangle(node, transform, graphics)
  if (node.name === "circle") addCircle(node, transform, graphics)
  if (node.name === "path") addPath(node, transform, graphics)

  for (const child of node.children) {
    addSvgNode(child, transform, graphics)
  }
}

export const convertSvgToKicadGraphics = ({
  svg,
  paperSize,
  kicadSch,
}: {
  svg: string
  paperSize: PaperSize
  kicadSch: KicadSch
}): void => {
  const root = parseSync(svg)
  const viewBox = root.attributes.viewBox
    ?.trim()
    .split(/[\s,]+/)
    .map(Number)
  const viewBoxX = viewBox?.[0] ?? 0
  const viewBoxY = viewBox?.[1] ?? 0
  const viewBoxWidth = viewBox?.[2] ?? parseNumber(root.attributes.width)
  const viewBoxHeight = viewBox?.[3] ?? parseNumber(root.attributes.height)
  if (viewBoxWidth <= 0 || viewBoxHeight <= 0) return

  const availableWidth = paperSize.width - SVG_PAPER_MARGIN_MM * 2
  const availableHeight = paperSize.height - SVG_PAPER_MARGIN_MM * 2
  const scale = Math.min(
    availableWidth / viewBoxWidth,
    availableHeight / viewBoxHeight,
  )
  const renderedWidth = viewBoxWidth * scale
  const renderedHeight = viewBoxHeight * scale
  const transform: SvgTransform = {
    scale,
    offsetX: (paperSize.width - renderedWidth) / 2 - viewBoxX * scale,
    offsetY: (paperSize.height - renderedHeight) / 2 - viewBoxY * scale,
  }

  const graphics: KicadGraphicCollections = {
    polylines: [...kicadSch.polylines],
    rectangles: [...kicadSch.rectangles],
    texts: [...kicadSch.texts],
  }
  addSvgNode(root, transform, graphics)
  kicadSch.polylines = graphics.polylines
  kicadSch.rectangles = graphics.rectangles
  kicadSch.texts = graphics.texts
}
