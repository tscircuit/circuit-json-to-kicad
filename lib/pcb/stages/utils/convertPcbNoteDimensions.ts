import type { PcbNoteDimension } from "circuit-json"
import { GrLine, GrPoly, GrText, TextEffects, TextEffectsFont } from "kicadts"
import { applyToPoint, type Matrix } from "transformation-matrix"
import {
  createNoteStroke,
  getPcbNoteLayer,
  type PcbNoteGraphics,
} from "./convertPcbNoteGraphics"
import { generateDeterministicUuid } from "./generateDeterministicUuid"

type Point = { x: number; y: number }
const add = (point: Point, direction: Point, distance: number): Point => ({
  x: point.x + direction.x * distance,
  y: point.y + direction.y * distance,
})

/** Dimensions use ordinary KiCad graphics so arrows, offsets, and custom labels survive export. */
export function convertPcbNoteDimensions(
  notes: PcbNoteDimension[],
  matrix: Matrix,
): PcbNoteGraphics {
  const graphics: PcbNoteGraphics = {
    lines: [],
    rectangles: [],
    polygons: [],
    texts: [],
  }
  for (const note of notes) {
    const length = Math.hypot(note.to.x - note.from.x, note.to.y - note.from.y)
    if (
      !Number.isFinite(length) ||
      length === 0 ||
      !Number.isFinite(note.arrow_size) ||
      note.arrow_size <= 0
    )
      continue
    const direction = {
      x: (note.to.x - note.from.x) / length,
      y: (note.to.y - note.from.y) / length,
    }
    const perpendicular = { x: -direction.y, y: direction.x }
    const offsetLength = Math.hypot(
      note.offset_direction?.x ?? 0,
      note.offset_direction?.y ?? 0,
    )
    const offsetDirection =
      offsetLength > 0
        ? {
            x: note.offset_direction!.x / offsetLength,
            y: note.offset_direction!.y / offsetLength,
          }
        : { x: 0, y: 0 }
    const offset = note.offset_distance ?? 0
    const from = add(note.from, offsetDirection, offset)
    const to = add(note.to, offsetDirection, offset)
    const layer = getPcbNoteLayer(note.layer)
    const uuid = (part: string) =>
      generateDeterministicUuid(`${note.pcb_note_dimension_id}:${part}`)
    const line = (start: Point, end: Point, part: string) => {
      graphics.lines.push(
        new GrLine({
          start: applyToPoint(matrix, start),
          end: applyToPoint(matrix, end),
          layer,
          stroke: createNoteStroke(note.arrow_size / 5),
          uuid: uuid(part),
        }),
      )
    }
    const fromBase = add(from, direction, note.arrow_size)
    const toBase = add(to, direction, -note.arrow_size)
    line(fromBase, toBase, "line")
    const extensionDirection =
      offsetLength > 0 ? offsetDirection : perpendicular
    line(
      note.from,
      add(note.from, extensionDirection, offset + note.arrow_size),
      "from-extension",
    )
    line(
      note.to,
      add(note.to, extensionDirection, offset + note.arrow_size),
      "to-extension",
    )
    for (const [index, tip, base] of [
      [0, from, fromBase],
      [1, to, toBase],
    ] as const) {
      graphics.polygons.push(
        new GrPoly({
          points: [
            tip,
            add(base, perpendicular, note.arrow_size / 2),
            add(base, perpendicular, -note.arrow_size / 2),
          ].map((point) => applyToPoint(matrix, point)),
          layer,
          fill: true,
          stroke: createNoteStroke(0),
          uuid: uuid(`arrow:${index}`),
        }),
      )
    }
    const fontSize = note.font_size
    const rotation = note.text_ccw_rotation ?? 0
    const radians = (rotation * Math.PI) / 180
    const text = note.text ?? `${Number(length.toFixed(3))}mm`
    // Keep rotated custom text clear of the measurement line.
    const extraOffset =
      note.text && rotation !== 0
        ? Math.abs(Math.sin(radians)) * text.length * fontSize * 0.3 +
          (Math.abs(Math.cos(radians)) * fontSize) / 2 +
          fontSize * 0.2
        : 0
    const textPoint = add(
      { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
      perpendicular,
      note.arrow_size * 1.5 + extraOffset,
    )
    const position = applyToPoint(matrix, textPoint)
    const transformedFrom = applyToPoint(matrix, from)
    const transformedTo = applyToPoint(matrix, to)
    let angle =
      (-Math.atan2(
        transformedTo.y - transformedFrom.y,
        transformedTo.x - transformedFrom.x,
      ) *
        180) /
      Math.PI
    if (angle > 90 || angle < -90) angle += 180
    const font = new TextEffectsFont()
    font.size = { width: fontSize, height: fontSize }
    font.thickness = Math.min(0.15, fontSize / 5)
    graphics.texts.push(
      new GrText({
        text,
        position: { ...position, angle: angle + rotation },
        layer,
        effects: new TextEffects({ font }),
        uuid: uuid("text"),
      }),
    )
  }
  return graphics
}
