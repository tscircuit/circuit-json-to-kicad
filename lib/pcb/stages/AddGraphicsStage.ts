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

    // Add board outline from pcb_board
    const pcbBoards = this.ctx.db.pcb_board?.list() || []

    if (pcbBoards.length > 0) {
      const board = pcbBoards[0]
      const halfWidth = board.width / 2
      const halfHeight = board.height / 2

      // Define the 4 corners of the board relative to center
      const corners = [
        { x: board.center.x - halfWidth, y: board.center.y - halfHeight },
        { x: board.center.x + halfWidth, y: board.center.y - halfHeight },
        { x: board.center.x + halfWidth, y: board.center.y + halfHeight },
        { x: board.center.x - halfWidth, y: board.center.y + halfHeight },
      ]

      // Transform corners to KiCad coordinates
      const transformedCorners = corners.map(corner =>
        applyToPoint(c2kMatPcb, corner)
      )

      // Create 4 edge cut lines forming a rectangle
      for (let i = 0; i < transformedCorners.length; i++) {
        const start = transformedCorners[i]
        const end = transformedCorners[(i + 1) % transformedCorners.length]

        const edgeLine = new GrLine({
          start: { x: start.x, y: start.y },
          end: { x: end.x, y: end.y },
          layer: "Edge.Cuts",
          width: 0.1,
        })

        const graphicLines = kicadPcb.graphicLines
        graphicLines.push(edgeLine)
        kicadPcb.graphicLines = graphicLines
      }
    }

    this.finished = true
  }

  override getOutput(): KicadPcb {
    return this.ctx.kicadPcb!
  }
}
