import type { PcbNoteDimension, PcbNoteLine, PcbNotePath } from "circuit-json"
import { At, FpLine, FpPoly, FpText } from "kicadts"
import { compose, rotate, scale, translate } from "transformation-matrix"
import { convertPcbNoteGraphics } from "../utils/convertPcbNoteGraphics"
import { convertPcbNoteDimensions } from "../utils/convertPcbNoteDimensions"

export function convertNoteGraphics({
  lines,
  paths,
  dimensions,
  componentCenter,
  componentRotation,
}: {
  lines: PcbNoteLine[]
  paths: PcbNotePath[]
  dimensions: PcbNoteDimension[]
  componentCenter: { x: number; y: number }
  componentRotation: number
}) {
  const matrix = compose(
    rotate((componentRotation * Math.PI) / 180),
    scale(1, -1),
    translate(-componentCenter.x, -componentCenter.y),
  )
  const graphics = convertPcbNoteGraphics({ lines, paths, matrix })
  const dimensionGraphics = convertPcbNoteDimensions(dimensions, matrix)
  return {
    lines: [...graphics.lines, ...dimensionGraphics.lines].map(
      (line) =>
        new FpLine({
          start: line.start,
          end: line.end,
          layer: line.layer,
          stroke: line.stroke,
          uuid: line.uuid,
        }),
    ),
    polygons: dimensionGraphics.polygons.map(
      (polygon) =>
        new FpPoly({
          points: polygon.points,
          layer: polygon.layer,
          stroke: polygon.stroke,
          fill: polygon.fill,
          uuid: polygon.uuid,
        }),
    ),
    texts: dimensionGraphics.texts.map(
      (text) =>
        new FpText({
          type: "user",
          text: text.text,
          position: text.position
            ? {
                x: text.position.x,
                y: text.position.y,
                angle:
                  (text.position instanceof At
                    ? (text.position.angle ?? 0)
                    : 0) + componentRotation,
              }
            : undefined,
          layer: text.layer,
          effects: text.effects,
          uuid: text.uuid,
        }),
    ),
  }
}
