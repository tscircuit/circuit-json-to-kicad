import type { PcbSilkscreenCircle, PcbSilkscreenLine } from "circuit-json"
import { GrCircle, GrLine } from "kicadts"
import { applyToPoint, type Matrix } from "transformation-matrix"
import { generateDeterministicUuid } from "../utils/generateDeterministicUuid"

/**
 * Transform board-space points (mm, +X right, +Y up) to KiCad board-space
 * points (mm, +X right, +Y down). Component-owned drawings are exported by
 * AddFootprintsStage, so they must not also become detached board graphics.
 */
export function convertStandaloneSilkscreenPrimitives({
  silkscreenLines,
  silkscreenCircles,
  c2kMatPcb,
}: {
  silkscreenLines: PcbSilkscreenLine[]
  silkscreenCircles: PcbSilkscreenCircle[]
  c2kMatPcb: Matrix
}) {
  const graphicLines = silkscreenLines
    .filter((line) => !line.pcb_component_id)
    .map(
      (line) =>
        new GrLine({
          start: applyToPoint(c2kMatPcb, { x: line.x1, y: line.y1 }),
          end: applyToPoint(c2kMatPcb, { x: line.x2, y: line.y2 }),
          layer: line.layer === "bottom" ? "B.SilkS" : "F.SilkS",
          width: line.stroke_width,
          uuid: generateDeterministicUuid(line.pcb_silkscreen_line_id),
        }),
    )

  const graphicCircles = silkscreenCircles
    .filter((circle) => !circle.pcb_component_id)
    .map(
      (circle) =>
        new GrCircle({
          center: applyToPoint(c2kMatPcb, circle.center),
          end: applyToPoint(c2kMatPcb, {
            x: circle.center.x + circle.radius,
            y: circle.center.y,
          }),
          layer: circle.layer === "bottom" ? "B.SilkS" : "F.SilkS",
          width: circle.stroke_width,
          fill: "none",
          uuid: generateDeterministicUuid(circle.pcb_silkscreen_circle_id),
        }),
    )

  return { graphicLines, graphicCircles }
}
