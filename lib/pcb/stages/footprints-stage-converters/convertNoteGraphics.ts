import type { PcbNoteLine, PcbNotePath } from "circuit-json"
import { FpLine } from "kicadts"
import { compose, rotate, scale, translate } from "transformation-matrix"
import { convertPcbNoteGraphics } from "../utils/convertPcbNoteGraphics"

export function convertNoteGraphics({
  lines,
  paths,
  componentCenter,
  componentRotation,
}: {
  lines: PcbNoteLine[]
  paths: PcbNotePath[]
  componentCenter: { x: number; y: number }
  componentRotation: number
}) {
  const matrix = compose(
    rotate((componentRotation * Math.PI) / 180),
    scale(1, -1),
    translate(-componentCenter.x, -componentCenter.y),
  )
  return convertPcbNoteGraphics({ lines, paths, matrix }).lines.map(
    (line) =>
      new FpLine({
        start: line.start,
        end: line.end,
        layer: line.layer,
        stroke: line.stroke,
        uuid: line.uuid,
      }),
  )
}
