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
  Uuid,
  Xy,
} from "kicadts"
import { applyToPoint } from "transformation-matrix"
import { ConverterStage } from "../../types"

const DEFAULT_SECTION_TEXT_SIZE_MM = 1.27
const DEFAULT_SECTION_LINE_COLOR = { r: 0, g: 0, b: 0, a: 1 } as const
const DEFAULT_SECTION_TEXT_COLOR = { r: 0, g: 0, b: 0, a: 1 } as const

const isStandaloneSchematicElement = (
  element: CircuitSchematicLine | CircuitSchematicText,
): boolean => !element.schematic_component_id

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
        const position = applyToPoint(this.ctx.c2kMatSch, {
          x: text.position?.x ?? 0,
          y: text.position?.y ?? 0,
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
