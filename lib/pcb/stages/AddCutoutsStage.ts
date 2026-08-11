import type { CircuitJson, PcbCutout } from "circuit-json"
import type { KicadPcb } from "kicadts"
import { GrCircle, GrLine, GrPoly, GrRect } from "kicadts"
import { ConverterStage, type ConverterContext } from "../../types"
import { applyToPoint } from "transformation-matrix"

const EDGE_CUTS_WIDTH = 0.05

/**
 * Translates pcb_cutout elements from circuit-json to KiCad Edge.Cuts graphics.
 * Each cutout shape becomes a closed contour on the Edge.Cuts layer so fabs
 * know to mill out the interior region.
 */
export class AddCutoutsStage extends ConverterStage<CircuitJson, KicadPcb> {
  override _step(): void {
    const { kicadPcb, c2kMatPcb, db } = this.ctx

    if (!kicadPcb) throw new Error("KicadPcb not initialized")
    if (!c2kMatPcb) throw new Error("PCB transform matrix not initialized")

    const cutouts = (db.pcb_cutout?.list() ?? []) as PcbCutout[]

    for (const cutout of cutouts) {
      if (cutout.shape === "circle") {
        const center = applyToPoint(c2kMatPcb, { x: cutout.center.x, y: cutout.center.y })
        const edge = applyToPoint(c2kMatPcb, { x: cutout.center.x + cutout.radius, y: cutout.center.y })
        const circle = new GrCircle({
          center: { x: center.x, y: center.y },
          end: { x: edge.x, y: edge.y },
          layer: "Edge.Cuts",
          width: EDGE_CUTS_WIDTH,
        })
        const circles = kicadPcb.graphicCircles ?? []
        circles.push(circle)
        kicadPcb.graphicCircles = circles
      } else if (cutout.shape === "rect") {
        const hw = cutout.width / 2
        const hh = cutout.height / 2
        const tl = applyToPoint(c2kMatPcb, { x: cutout.center.x - hw, y: cutout.center.y + hh })
        const tr = applyToPoint(c2kMatPcb, { x: cutout.center.x + hw, y: cutout.center.y + hh })
        const br = applyToPoint(c2kMatPcb, { x: cutout.center.x + hw, y: cutout.center.y - hh })
        const bl = applyToPoint(c2kMatPcb, { x: cutout.center.x - hw, y: cutout.center.y - hh })
        const corners = [tl, tr, br, bl, tl]
        const lines = kicadPcb.graphicLines ?? []
        for (let i = 0; i < corners.length - 1; i++) {
          const s = corners[i]!
          const e = corners[i + 1]!
          lines.push(new GrLine({
            start: { x: s.x, y: s.y },
            end: { x: e.x, y: e.y },
            layer: "Edge.Cuts",
            width: EDGE_CUTS_WIDTH,
          }))
        }
        kicadPcb.graphicLines = lines
      } else if (cutout.shape === "polygon") {
        const transformed = cutout.points.map((p) => applyToPoint(c2kMatPcb, p))
        const poly = new GrPoly({
          points: transformed.map((p) => ({ x: p.x, y: p.y })),
          layer: "Edge.Cuts",
          width: EDGE_CUTS_WIDTH,
        })
        const polys = kicadPcb.graphicPolys ?? []
        polys.push(poly)
        kicadPcb.graphicPolys = polys
      }
    }

    this.finished = true
  }
}
