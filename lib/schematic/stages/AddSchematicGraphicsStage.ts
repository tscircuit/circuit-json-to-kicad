import type {
  CircuitJson,
  SchematicArc as CircuitSchematicArc,
  SchematicLine as CircuitSchematicLine,
  SchematicPath as CircuitSchematicPath,
  SchematicRect as CircuitSchematicRect,
  SchematicText as CircuitSchematicText,
} from "circuit-json"
import type { KicadSch } from "kicadts"
import {
  Polyline,
  Pts,
  SchematicArc,
  SchematicRectangle,
  SchematicText,
  Stroke,
  SymbolArcFill,
  SymbolRectangleFill,
  TextEffects,
  TextEffectsFont,
  TextEffectsJustify,
  Uuid,
  Xy,
} from "kicadts"
import { applyToPoint } from "transformation-matrix"
import { ConverterStage } from "../../types"
import { getSchematicArcPoints } from "../getSchematicArcPoints"
import { getTextJustificationFromAnchor } from "./utils/getTextJustificationFromAnchor"
import { hasComponentLevelSymbolPrimitives } from "./utils/hasComponentLevelSymbolPrimitives"
import { parseColor } from "./utils/parseColor"

const DEFAULT_SECTION_TEXT_SIZE_MM = 1.27
const DEFAULT_SECTION_LINE_COLOR = { r: 0, g: 0, b: 0, a: 1 } as const
const DEFAULT_SECTION_TEXT_COLOR = { r: 0, g: 0, b: 0, a: 1 } as const
const DEFAULT_SECTION_TEXT_PADDING_X_MM = 0.22
const DEFAULT_SECTION_TEXT_PADDING_Y_MM = 0.18

const isStandaloneSchematicElement = (
  element:
    | CircuitSchematicArc
    | CircuitSchematicLine
    | CircuitSchematicPath
    | CircuitSchematicRect
    | CircuitSchematicText,
): boolean =>
  !element.schematic_component_id &&
  !("schematic_symbol_id" in element && element.schematic_symbol_id)

export class AddSchematicGraphicsStage extends ConverterStage<
  CircuitJson,
  KicadSch
> {
  override _step(): void {
    const { kicadSch, db } = this.ctx

    if (!kicadSch) {
      throw new Error("KicadSch instance not initialized in context")
    }

    if (!this.ctx.c2kMatSch) {
      this.finished = true
      return
    }

    const schematicLines = (db.schematic_line?.list() || []).filter(
      isStandaloneSchematicElement,
    )
    const schematicArcs = (db.schematic_arc?.list() || []).filter(
      isStandaloneSchematicElement,
    )
    const schematicTexts = (db.schematic_text?.list() || []).filter(
      isStandaloneSchematicElement,
    )
    const preserveStandaloneGraphics = db.schematic_component
      .list()
      .some((component) =>
        hasComponentLevelSymbolPrimitives(this.ctx.circuitJson, component),
      )
    const schematicRects = preserveStandaloneGraphics
      ? (db.schematic_rect?.list() || []).filter(isStandaloneSchematicElement)
      : []
    const schematicPaths = preserveStandaloneGraphics
      ? (db.schematic_path?.list() || []).filter(isStandaloneSchematicElement)
      : []

    if (
      schematicLines.length === 0 &&
      schematicArcs.length === 0 &&
      schematicTexts.length === 0 &&
      schematicRects.length === 0 &&
      schematicPaths.length === 0
    ) {
      this.finished = true
      return
    }

    if (schematicArcs.length > 0) {
      const arcs = kicadSch.arcs || []
      for (const arc of schematicArcs) {
        const points = getSchematicArcPoints(arc)
        const start = applyToPoint(this.ctx.c2kMatSch, points.start)
        const mid = applyToPoint(this.ctx.c2kMatSch, points.mid)
        const end = applyToPoint(this.ctx.c2kMatSch, points.end)

        const stroke = new Stroke()
        stroke.width =
          (arc.stroke_width ?? 0) * (this.ctx.kicadSchematicScaleFactor ?? 1)
        stroke.type = arc.is_dashed ? "dash" : "default"
        stroke.color = preserveStandaloneGraphics
          ? (parseColor(arc.color) ?? DEFAULT_SECTION_LINE_COLOR)
          : DEFAULT_SECTION_LINE_COLOR

        const fill = new SymbolArcFill()
        fill.type = "none"

        arcs.push(
          new SchematicArc({
            start,
            mid,
            end,
            stroke,
            fill,
            uuid: crypto.randomUUID(),
          }),
        )
      }
      kicadSch.arcs = arcs
    }

    if (schematicLines.length > 0) {
      const polylines = kicadSch.polylines || []
      for (const line of schematicLines) {
        const start = applyToPoint(this.ctx.c2kMatSch, {
          x: line.x1,
          y: line.y1,
        })
        const end = applyToPoint(this.ctx.c2kMatSch, {
          x: line.x2,
          y: line.y2,
        })

        const polyline = new Polyline()
        polyline.points = new Pts([
          new Xy(start.x, start.y),
          new Xy(end.x, end.y),
        ])

        const stroke = new Stroke()
        stroke.width = 0
        stroke.type = "default"
        stroke.color = preserveStandaloneGraphics
          ? (parseColor(line.color) ?? DEFAULT_SECTION_LINE_COLOR)
          : DEFAULT_SECTION_LINE_COLOR
        polyline.stroke = stroke
        polyline.uuid = new Uuid(crypto.randomUUID())

        polylines.push(polyline)
      }
      kicadSch.polylines = polylines
    }

    if (schematicPaths.length > 0) {
      const polylines = kicadSch.polylines || []
      for (const path of schematicPaths) {
        if (path.points.length < 2) continue

        const stroke = new Stroke()
        stroke.width =
          (path.stroke_width ?? 0) * (this.ctx.kicadSchematicScaleFactor ?? 1)
        stroke.type = path.is_dashed ? "dash" : "default"
        stroke.color = preserveStandaloneGraphics
          ? (parseColor(path.stroke_color ?? "") ?? DEFAULT_SECTION_LINE_COLOR)
          : DEFAULT_SECTION_LINE_COLOR

        polylines.push(
          new Polyline({
            points: new Pts(
              path.points.map((point) => {
                const transformed = applyToPoint(this.ctx.c2kMatSch!, point)
                return new Xy(transformed.x, transformed.y)
              }),
            ),
            stroke,
            uuid: crypto.randomUUID(),
          }),
        )
      }
      kicadSch.polylines = polylines
    }

    if (schematicRects.length > 0) {
      const rectangles = kicadSch.rectangles || []
      for (const rect of schematicRects) {
        const halfWidth = rect.width / 2
        const halfHeight = rect.height / 2
        const firstCorner = applyToPoint(this.ctx.c2kMatSch, {
          x: rect.center.x - halfWidth,
          y: rect.center.y - halfHeight,
        })
        const secondCorner = applyToPoint(this.ctx.c2kMatSch, {
          x: rect.center.x + halfWidth,
          y: rect.center.y + halfHeight,
        })

        const stroke = new Stroke()
        stroke.width =
          (rect.stroke_width ?? 0) * (this.ctx.kicadSchematicScaleFactor ?? 1)
        stroke.type = rect.is_dashed ? "dash" : "default"
        stroke.color = preserveStandaloneGraphics
          ? (parseColor(rect.color) ?? DEFAULT_SECTION_LINE_COLOR)
          : DEFAULT_SECTION_LINE_COLOR

        const fill = new SymbolRectangleFill()
        const fillColor = rect.fill_color
          ? parseColor(rect.fill_color)
          : undefined
        fill.type = rect.is_filled
          ? fillColor
            ? "color"
            : "background"
          : "none"
        if (fillColor) fill.color = fillColor

        rectangles.push(
          new SchematicRectangle({
            start: {
              x: Math.min(firstCorner.x, secondCorner.x),
              y: Math.min(firstCorner.y, secondCorner.y),
            },
            end: {
              x: Math.max(firstCorner.x, secondCorner.x),
              y: Math.max(firstCorner.y, secondCorner.y),
            },
            stroke,
            fill,
            uuid: crypto.randomUUID(),
          }),
        )
      }
      kicadSch.rectangles = rectangles
    }

    if (schematicTexts.length > 0) {
      const texts = kicadSch.texts || []
      for (const text of schematicTexts) {
        const isInlineTraceText = "source_trace_id" in text
        const preserveText = preserveStandaloneGraphics && !isInlineTraceText
        let sourceY = text.position?.y ?? 0
        if (
          !isInlineTraceText &&
          !preserveText &&
          text.position?.y !== undefined &&
          text.position.y < 2
        ) {
          sourceY = text.position.y - DEFAULT_SECTION_TEXT_PADDING_Y_MM
        }
        const position = applyToPoint(this.ctx.c2kMatSch, {
          x:
            (text.position?.x ?? 0) +
            (isInlineTraceText || preserveText
              ? 0
              : DEFAULT_SECTION_TEXT_PADDING_X_MM),
          y: sourceY,
        })

        const font = new TextEffectsFont()
        const fontSize = preserveText
          ? Math.max(
              0.01,
              text.font_size * (this.ctx.kicadSchematicScaleFactor ?? 1),
            )
          : DEFAULT_SECTION_TEXT_SIZE_MM
        font.size = { height: fontSize, width: fontSize }
        font.color = preserveText
          ? (parseColor(text.color) ?? DEFAULT_SECTION_TEXT_COLOR)
          : DEFAULT_SECTION_TEXT_COLOR

        const justify =
          isInlineTraceText || preserveText
            ? getTextJustificationFromAnchor(text.anchor)
            : undefined
        const effects = new TextEffects({
          font,
          hiddenText: false,
          justify: justify ? new TextEffectsJustify(justify) : undefined,
        })

        const schematicText = new SchematicText({
          value: text.text || "",
          at: [position.x, position.y, text.rotation || 0],
          excludeFromSim: false,
          effects,
          uuid: new Uuid(crypto.randomUUID()),
        })

        texts.push(schematicText)
      }
      kicadSch.texts = texts
    }

    this.finished = true
  }

  override getOutput(): KicadSch {
    return this.ctx.kicadSch!
  }
}
