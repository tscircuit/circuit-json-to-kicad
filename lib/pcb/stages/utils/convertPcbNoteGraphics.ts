import type { PcbNoteLine, PcbNotePath, PcbNoteRect } from "circuit-json"
import { GrLine, GrRect, Stroke } from "kicadts"
import { applyToPoint, type Matrix } from "transformation-matrix"
import { generateDeterministicUuid } from "./generateDeterministicUuid"

export const getPcbNoteLayer = (layer: string) =>
  layer === "bottom" ? "B.Fab" : layer === "top" ? "F.Fab" : layer

export function createNoteStroke(width: number, dashed = false) {
  const stroke = new Stroke()
  stroke.width = width
  stroke.type = dashed ? "dash" : "default"
  return stroke
}

export function convertPcbNoteGraphics({
  rectangles = [],
  lines = [],
  paths = [],
  matrix,
}: {
  rectangles?: PcbNoteRect[]
  lines?: PcbNoteLine[]
  paths?: PcbNotePath[]
  matrix: Matrix
}) {
  const graphicLines: GrLine[] = []
  const graphicRects: GrRect[] = []
  for (const note of lines) {
    graphicLines.push(
      new GrLine({
        start: applyToPoint(matrix, { x: note.x1, y: note.y1 }),
        end: applyToPoint(matrix, { x: note.x2, y: note.y2 }),
        layer: getPcbNoteLayer(note.layer),
        stroke: createNoteStroke(note.stroke_width, note.is_dashed),
        uuid: generateDeterministicUuid(note.pcb_note_line_id),
      }),
    )
  }
  for (const note of paths) {
    for (let index = 1; index < note.route.length; index++) {
      graphicLines.push(
        new GrLine({
          start: applyToPoint(matrix, note.route[index - 1]!),
          end: applyToPoint(matrix, note.route[index]!),
          layer: getPcbNoteLayer(note.layer),
          stroke: createNoteStroke(note.stroke_width),
          uuid: generateDeterministicUuid(`${note.pcb_note_path_id}:${index}`),
        }),
      )
    }
  }
  for (const note of rectangles) {
    if (note.has_stroke === false && !note.is_filled) continue
    const width = note.has_stroke === false ? 0 : note.stroke_width
    const halfWidth = note.width / 2
    const halfHeight = note.height / 2
    graphicRects.push(
      new GrRect({
        layer: getPcbNoteLayer(note.layer),
        stroke: createNoteStroke(width, note.is_stroke_dashed),
        fill: note.is_filled ?? false,
        uuid: generateDeterministicUuid(note.pcb_note_rect_id),
        start: applyToPoint(matrix, {
          x: note.center.x - halfWidth,
          y: note.center.y + halfHeight,
        }),
        end: applyToPoint(matrix, {
          x: note.center.x + halfWidth,
          y: note.center.y - halfHeight,
        }),
      }),
    )
  }
  return { lines: graphicLines, rectangles: graphicRects }
}
