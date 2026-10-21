import type { PcbNoteDimension } from "circuit-json"
import { Dimension } from "kicadts"
import { applyToPoint, type Matrix } from "transformation-matrix"
import { getPcbNoteLayer } from "./convertPcbNoteGraphics"
import { generateDeterministicUuid } from "./generateDeterministicUuid"

// KiCad's file-format enum values, not drawing proportions.
const MILLIMETRES = 2
const UNITS_SUFFIX = 1
const TEXT_OUTSIDE = 0
const MEASUREMENT_DECIMAL_PLACES = 3
const DEFAULT_DIMENSION_STROKE_WIDTH = 0.15

export function convertPcbNoteDimensions(
  notes: PcbNoteDimension[],
  matrix: Matrix,
): Dimension[] {
  return notes.flatMap((note) => {
    const from = applyToPoint(matrix, note.from)
    const to = applyToPoint(matrix, note.to)
    const dx = to.x - from.x
    const dy = to.y - from.y
    const length = Math.hypot(dx, dy)
    if (!Number.isFinite(length) || length === 0 || note.arrow_size <= 0)
      return []
    const offsetDirection = note.offset_direction ?? {
      x: -(note.to.y - note.from.y),
      y: note.to.x - note.from.x,
    }
    const offsetLength = Math.hypot(offsetDirection.x, offsetDirection.y)
    const offset =
      offsetLength === 0 ? 0 : (note.offset_distance ?? 0) / offsetLength
    const shifted = applyToPoint(matrix, {
      x: note.from.x + offsetDirection.x * offset,
      y: note.from.y + offsetDirection.y * offset,
    })
    const height =
      (dx * (shifted.y - from.y) - dy * (shifted.x - from.x)) / length
    // Dimension exposes a structured S-expression factory rather than setters.
    return [
      Dimension.fromSexprPrimitives([
        ["type", "aligned"],
        ["layer", getPcbNoteLayer(note.layer)],
        ["uuid", generateDeterministicUuid(note.pcb_note_dimension_id)],
        ["pts", ["xy", from.x, from.y], ["xy", to.x, to.y]],
        ["height", height],
        [
          "gr_text",
          note.text ?? "",
          [
            "at",
            (from.x + to.x) / 2,
            (from.y + to.y) / 2,
            (-Math.atan2(dy, dx) * 180) / Math.PI +
              (note.text_ccw_rotation ?? 0),
          ],
          ["layer", getPcbNoteLayer(note.layer)],
          ["effects", ["font", ["size", note.font_size, note.font_size]]],
        ],
        [
          "format",
          ["units", MILLIMETRES],
          ["units_format", UNITS_SUFFIX],
          ["precision", MEASUREMENT_DECIMAL_PLACES],
          ...(note.text === undefined ? [] : [["override_value", note.text]]),
        ],
        [
          "style",
          ["thickness", DEFAULT_DIMENSION_STROKE_WIDTH],
          ["arrow_length", note.arrow_size],
          ["text_position_mode", TEXT_OUTSIDE],
        ],
      ]),
    ]
  })
}
