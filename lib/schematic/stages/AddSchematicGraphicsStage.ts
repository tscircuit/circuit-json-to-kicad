import type { CircuitJson } from "circuit-json"
import type { KicadSch } from "kicadts"
import {
  Polyline,
  Pts,
  SchematicText,
  Stroke,
  TextEffects,
  TextEffectsFont,
  Uuid,
  Xy,
} from "kicadts"
import { applyToPoint } from "transformation-matrix"
import { ConverterStage } from "../../types"

const DEFAULT_SECTION_TEXT_SIZE_MM = 1.27
const DEFAULT_SECTION_LINE_COLOR = { r: 0, g: 0, b: 0, a: 1 } as const
const DEFAULT_SECTION_TEXT_COLOR = { r: 0, g: 0, b: 0, a: 1 } as const

type SchematicLineRecord = {
  schematic_component_id?: string | null
  x1: number
  y1: number
  x2: number
  y2: number
}

type SchematicTextRecord = {
  schematic_component_id?: string | null
  position?: { x: number; y: number }
  rotation?: number
  text?: string
}

const isStandaloneSchematicLine = (line: SchematicLineRecord): boolean =>
  !line.schematic_component_id

const isStandaloneSchematicText = (text: SchematicTextRecord): boolean =>
  !text.schematic_component_id

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
      isStandaloneSchematicLine,
    )
    const schematicTexts = (db.schematic_text?.list() || []).filter(
      isStandaloneSchematicText,
    )

    if (schematicLines.length === 0 && schematicTexts.length === 0) {
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
        const sourceY =
          text.position?.y !== undefined && text.position.y < 2
            ? text.position.y - 0.18
            : (text.position?.y ?? 0)
        const position = applyToPoint(this.ctx.c2kMatSch, {
          x: (text.position?.x ?? 0) + 0.22,
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
