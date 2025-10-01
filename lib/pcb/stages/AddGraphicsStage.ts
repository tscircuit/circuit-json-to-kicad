import type { CircuitJson } from "circuit-json"
import type { KicadPcb } from "kicadts"
import { GrLine } from "kicadts"
import { ConverterStage, type ConverterContext } from "../../types"
import { applyToPoint } from "transformation-matrix"

/**
 * Adds graphics (silkscreen, board outline, etc.) to the PCB from circuit JSON
 */
export class AddGraphicsStage extends ConverterStage<CircuitJson, KicadPcb> {
  override _step(): void {
    const { kicadPcb, c2kMatPcb } = this.ctx

    if (!kicadPcb) {
      throw new Error("KicadPcb instance not initialized in context")
    }

    if (!c2kMatPcb) {
      throw new Error("PCB transformation matrix not initialized in context")
    }

    // Get PCB board silkscreen paths if they exist
    const pcbSilkscreenPaths = this.ctx.db.pcb_silkscreen_path?.list() || []

    for (const path of pcbSilkscreenPaths) {
      if (!path.route || path.route.length < 2) continue

      // Create line segments for each pair of points
      for (let i = 0; i < path.route.length - 1; i++) {
        const startPoint = path.route[i]
        const endPoint = path.route[i + 1]

        if (!startPoint || !endPoint) continue

        // Transform points to KiCad coordinates
        const transformedStart = applyToPoint(c2kMatPcb, {
          x: startPoint.x,
          y: startPoint.y,
        })
        const transformedEnd = applyToPoint(c2kMatPcb, {
          x: endPoint.x,
          y: endPoint.y,
        })

        // Map circuit JSON layer names to KiCad layer names
        const layerMap: Record<string, string> = {
          top: "F.SilkS",
          bottom: "B.SilkS",
        }
        const kicadLayer = layerMap[path.layer] || path.layer || "F.SilkS"

        // Create a graphics line
        const grLine = new GrLine({
          start: { x: transformedStart.x, y: transformedStart.y },
          end: { x: transformedEnd.x, y: transformedEnd.y },
          layer: kicadLayer,
          width: path.stroke_width || 0.15,
        })

        // Add the graphics line to the PCB
        const graphicLines = kicadPcb.graphicLines
        graphicLines.push(grLine)
        kicadPcb.graphicLines = graphicLines
      }
    }

    // TODO: Add board outline from pcb_board if available
    // For now, we'll skip board outline generation

    this.finished = true
  }

  override getOutput(): KicadPcb {
    return this.ctx.kicadPcb!
  }
}
