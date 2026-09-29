import type { PcbFabricationNotePath } from "circuit-json"
import { GrLine } from "kicadts"
import { applyToPoint, type Matrix } from "transformation-matrix"

/** Convert board-space fabrication paths into KiCad board graphics. */
export function convertStandaloneFabricationNotePaths({
  fabricationNotePaths,
  c2kMatPcb,
}: {
  fabricationNotePaths: PcbFabricationNotePath[]
  c2kMatPcb: Matrix
}): GrLine[] {
  const lines: GrLine[] = []
  for (const path of fabricationNotePaths) {
    // Owned paths are already emitted by AddFootprintsStage.
    if (path.pcb_component_id) continue
    for (let index = 0; index < path.route.length - 1; index++) {
      const start = path.route[index]
      const end = path.route[index + 1]
      if (!start || !end) continue
      lines.push(
        new GrLine({
          start: applyToPoint(c2kMatPcb, start),
          end: applyToPoint(c2kMatPcb, end),
          layer: path.layer === "bottom" ? "B.Fab" : "F.Fab",
          width: path.stroke_width || 0.1,
        }),
      )
    }
  }
  return lines
}
