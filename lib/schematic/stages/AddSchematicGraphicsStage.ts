import type {
  CircuitJson,
  SchematicArc as CircuitSchematicArc,
  SchematicLine as CircuitSchematicLine,
  SchematicText as CircuitSchematicText,
} from "circuit-json"
import type { KicadSch } from "kicadts"
import {
  Polyline,
  Pts,
  SchematicArc,
  SchematicText,
  Stroke,
  TextEffects,
  TextEffectsFont,
  Uuid,
  Xy,
} from "kicadts"
import { applyToPoint } from "transformation-matrix"
import { ConverterStage } from "../../types"
import { getSchematicArcStartMidEndPoints } from "../schematicArcGeometry"

const DEFAULT_SECTION_TEXT_SIZE_MM = 1.27
const DEFAULT_SECTION_LINE_COLOR = { r: 0, g: 0, b: 0, a: 1 } as const
const DEFAULT_SECTION_TEXT_COLOR = { r: 0, g: 0, b: 0, a: 1 } as const
const DEFAULT_SECTION_TEXT_PADDING_X_MM = 0.22
const DEFAULT_SECTION_TEXT_PADDING_Y_MM = 0.18
const RGBA_COLOR_REGEX =
  /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*(\d+(?:\.\d+)?)\s*)?\)$/i

const isStandaloneSchematicElement = (
  element: CircuitSchematicArc | CircuitSchematicLine | CircuitSchematicText,
): boolean => !element.schematic_component_id

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

const parseSchematicColor = (
  color?: string,
): { r: number; g: number; b: number; a: number } => {
  if (!color) return { ...DEFAULT_SECTION_LINE_COLOR }

  const rgbaMatch = color.match(RGBA_COLOR_REGEX)
  if (rgbaMatch) {
    return {
      r: clamp(Math.round(Number(rgbaMatch[1])), 0, 255),
      g: clamp(Math.round(Number(rgbaMatch[2])), 0, 255),
      b: clamp(Math.round(Number(rgbaMatch[3])), 0, 255),
      a: clamp(rgbaMatch[4] === undefined ? 1 : Number(rgbaMatch[4]), 0, 1),
    }
  }

  const hex = color.replace("#", "")
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
      a: 1,
    }
  }

  if (/^[0-9a-f]{8}$/i.test(hex)) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
      a: Number.parseInt(hex.slice(6, 8), 16) / 255,
    }
  }

  return { ...DEFAULT_SECTION_LINE_COLOR }
}

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

    const schematicArcs = (db.schematic_arc?.list() || []).filter(
      isStandaloneSchematicElement,
    )
    const schematicLines = (db.schematic_line?.list() || []).filter(
      isStandaloneSchematicElement,
    )
    const schematicTexts = (db.schematic_text?.list() || []).filter(
      isStandaloneSchematicElement,
    )

    if (
      schematicArcs.length === 0 &&
      schematicLines.length === 0 &&
      schematicTexts.length === 0
    ) {
      this.finished = true
      return
    }

    if (schematicArcs.length > 0) {
      const arcs = kicadSch.arcs || []

      for (const arc of schematicArcs) {
        const sourcePoints = getSchematicArcStartMidEndPoints(arc)
        const start = applyToPoint(this.ctx.c2kMatSch, sourcePoints.start)
        const mid = applyToPoint(this.ctx.c2kMatSch, sourcePoints.mid)
        const end = applyToPoint(this.ctx.c2kMatSch, sourcePoints.end)

        const stroke = new Stroke()
        stroke.width =
          (arc.stroke_width ?? 0) * this.ctx.kicadSchematicScaleFactor!
        stroke.type = arc.is_dashed ? "dash" : "solid"
        stroke.color = parseSchematicColor(arc.color)

        arcs.push(
          new SchematicArc({
            start,
            mid,
            end,
            stroke,
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
        stroke.color = DEFAULT_SECTION_LINE_COLOR
        polyline.stroke = stroke
        polyline.uuid = new Uuid(crypto.randomUUID())

        polylines.push(polyline)
      }
      kicadSch.polylines = polylines
    }

    if (schematicTexts.length > 0) {
      const texts = kicadSch.texts || []
      for (const text of schematicTexts) {
        let sourceY = text.position?.y ?? 0
        if (text.position?.y !== undefined && text.position.y < 2) {
          sourceY = text.position.y - DEFAULT_SECTION_TEXT_PADDING_Y_MM
        }
        const position = applyToPoint(this.ctx.c2kMatSch, {
          x: (text.position?.x ?? 0) + DEFAULT_SECTION_TEXT_PADDING_X_MM,
          y: sourceY,
        })

        const font = new TextEffectsFont()
        font.size = {
          height: DEFAULT_SECTION_TEXT_SIZE_MM,
          width: DEFAULT_SECTION_TEXT_SIZE_MM,
        }
        font.color = DEFAULT_SECTION_TEXT_COLOR

        const effects = new TextEffects({
          font,
          hiddenText: false,
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
