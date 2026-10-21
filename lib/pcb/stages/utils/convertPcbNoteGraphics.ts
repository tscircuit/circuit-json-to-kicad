import type { PcbNoteLine, PcbNotePath, PcbNoteRect } from "circuit-json"
import { GrLine, GrPoly, GrRect, GrText, Stroke } from "kicadts"
import { applyToPoint, type Matrix } from "transformation-matrix"
import { generateDeterministicUuid } from "./generateDeterministicUuid"

export interface PcbNoteGraphics {
  lines: GrLine[]
  rectangles: GrRect[]
  polygons: GrPoly[]
  texts: GrText[]
}

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
}): PcbNoteGraphics {
  const graphics: PcbNoteGraphics = {
    lines: [],
    rectangles: [],
    polygons: [],
    texts: [],
  }
  for (const note of lines) {
    graphics.lines.push(
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
      graphics.lines.push(
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
    const radius = Math.max(
      0,
      Math.min(note.corner_radius ?? 0, halfWidth, halfHeight),
    )
    const common = {
      layer: getPcbNoteLayer(note.layer),
      stroke: createNoteStroke(width, note.is_stroke_dashed),
      fill: note.is_filled ?? false,
      uuid: generateDeterministicUuid(note.pcb_note_rect_id),
    }
    if (radius > 0) {
      const points: Array<{ x: number; y: number }> = []
      for (let corner = 0; corner < 4; corner++) {
        const angle = (corner * Math.PI) / 2
        const center = {
          x:
            note.center.x +
            (corner === 0 || corner === 3 ? 1 : -1) * (halfWidth - radius),
          y: note.center.y + (corner < 2 ? 1 : -1) * (halfHeight - radius),
        }
        for (let step = 0; step <= 8; step++) {
          const theta = angle + (step * Math.PI) / 16
          points.push(
            applyToPoint(matrix, {
              x: center.x + Math.cos(theta) * radius,
              y: center.y + Math.sin(theta) * radius,
            }),
          )
        }
      }
      graphics.polygons.push(new GrPoly({ ...common, points }))
    } else {
      graphics.rectangles.push(
        new GrRect({
          ...common,
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
  }
  return graphics
}
