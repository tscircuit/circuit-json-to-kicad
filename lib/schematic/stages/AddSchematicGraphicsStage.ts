import type {
  CircuitJson,
  SchematicLine as CircuitSchematicLine,
  SchematicText as CircuitSchematicText,
} from "circuit-json"
import type { KicadSch } from "kicadts"
import {
  Polyline,
  Pts,
  SchematicText,
  Stroke,
  TextEffects,
  TextEffectsFont,
  TextEffectsJustify,
  Uuid,
  Xy,
} from "kicadts"
import { applyToPoint } from "transformation-matrix"
import { ConverterStage } from "../../types"
import { convertSvgToKicadGraphics } from "./utils/convertSvgToKicadGraphics"
import { getTextJustificationFromAnchor } from "./utils/getTextJustificationFromAnchor"

const DEFAULT_SECTION_TEXT_SIZE_MM = 1.27
const DEFAULT_SECTION_LINE_COLOR = { r: 0, g: 0, b: 0, a: 1 } as const
const DEFAULT_SECTION_TEXT_COLOR = { r: 0, g: 0, b: 0, a: 1 } as const
const DEFAULT_SECTION_TEXT_PADDING_X_MM = 0.22
const DEFAULT_SECTION_TEXT_PADDING_Y_MM = 0.18

const isStandaloneSchematicElement = (
  element: CircuitSchematicLine | CircuitSchematicText,
): boolean => !element.schematic_component_id

const decodeInlineSvg = (url: string): string | undefined => {
  const dataUrlMatch = url.match(/^data:image\/svg\+xml(;base64)?,(.*)$/s)
  if (!dataUrlMatch) return undefined

  const [, base64Marker, encodedData] = dataUrlMatch
  if (!encodedData) return undefined

  return base64Marker
    ? new TextDecoder().decode(
        Uint8Array.from(atob(encodedData), (character) =>
          character.charCodeAt(0),
        ),
      )
    : decodeURIComponent(encodedData)
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

    const schematicLines = (db.schematic_line?.list() || []).filter(
      isStandaloneSchematicElement,
    )
    const schematicTexts = (db.schematic_text?.list() || []).filter(
      isStandaloneSchematicElement,
    )
    const schematicGraphics = db.schematic_graphic?.list() || []

    if (
      schematicLines.length === 0 &&
      schematicTexts.length === 0 &&
      schematicGraphics.length === 0
    ) {
      this.finished = true
      return
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
        const isInlineTraceText = "source_trace_id" in text
        let sourceY = text.position?.y ?? 0
        if (
          !isInlineTraceText &&
          text.position?.y !== undefined &&
          text.position.y < 2
        ) {
          sourceY = text.position.y - DEFAULT_SECTION_TEXT_PADDING_Y_MM
        }
        const position = applyToPoint(this.ctx.c2kMatSch, {
          x:
            (text.position?.x ?? 0) +
            (isInlineTraceText ? 0 : DEFAULT_SECTION_TEXT_PADDING_X_MM),
          y: sourceY,
        })

        const font = new TextEffectsFont()
        font.size = {
          height: DEFAULT_SECTION_TEXT_SIZE_MM,
          width: DEFAULT_SECTION_TEXT_SIZE_MM,
        }
        font.color = DEFAULT_SECTION_TEXT_COLOR

        const justify = isInlineTraceText
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

    if (schematicGraphics.length > 0) {
      const paperSize = this.ctx.schematicPaperSize
      if (!paperSize) {
        throw new Error("Schematic paper size is required for graphics")
      }
      for (const graphic of schematicGraphics) {
        const inlineSvg =
          graphic.svg_content ??
          (graphic.asset ? decodeInlineSvg(graphic.asset.url) : undefined)
        if (!inlineSvg) continue

        convertSvgToKicadGraphics({
          svg: inlineSvg,
          paperSize,
          kicadSch,
        })
      }
    }

    this.finished = true
  }

  override getOutput(): KicadSch {
    return this.ctx.kicadSch!
  }
}
