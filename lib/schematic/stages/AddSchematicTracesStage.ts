import type { CircuitJson } from "circuit-json"
import type { KicadSch } from "kicadts"
import { Wire, Pts, Xy, Stroke, Junction, Uuid } from "kicadts"
import { ConverterStage, type ConverterContext } from "../../types"

/**
 * Adds schematic traces (wires) and junctions to the schematic
 */
export class AddSchematicTracesStage extends ConverterStage<
  CircuitJson,
  KicadSch
> {
  override _step(): void {
    const { kicadSch, db } = this.ctx

    // Get all schematic traces
    const schematicTraces = db.schematic_trace.list()

    if (schematicTraces.length === 0) {
      this.finished = true
      return
    }

    const wires: Wire[] = []
    const junctions: Junction[] = []

    // Process each trace
    for (const schematicTrace of schematicTraces) {
      // Add wires for each edge in the trace
      for (const edge of schematicTrace.edges) {
        const wire = this.createWireFromEdge(edge)
        wires.push(wire)
      }

      // Add junctions at junction points
      for (const junction of schematicTrace.junctions) {
        const kicadJunction = this.createJunction(junction)
        junctions.push(kicadJunction)
      }
    }

    // Add wires and junctions to the schematic
    kicadSch.wires = wires
    kicadSch.junctions = junctions

    this.finished = true
  }

  /**
   * Create a KiCad wire from a schematic trace edge
   */
  private createWireFromEdge(edge: any): Wire {
    const wire = new Wire()

    // Convert circuit-json coordinates (inches) to KiCad coordinates (mm)
    // KiCad default position is around 95.25, 73.66 for a centered component
    const x1 = 95.25 + edge.from.x * 25.4
    const y1 = 73.66 + edge.from.y * 25.4
    const x2 = 95.25 + edge.to.x * 25.4
    const y2 = 73.66 + edge.to.y * 25.4

    // Create points for the wire
    const pts = new Pts([new Xy(x1, y1), new Xy(x2, y2)])
    wire.points = pts

    // Create stroke for the wire (default wire stroke)
    const stroke = new Stroke()
    stroke.width = 0 // 0 means use default width
    stroke.type = "default"
    wire.stroke = stroke

    // Generate UUID for the wire
    wire.uuid = crypto.randomUUID()

    return wire
  }

  /**
   * Create a KiCad junction from a circuit-json junction point
   */
  private createJunction(junction: { x: number; y: number }): Junction {
    // Convert circuit-json coordinates (inches) to KiCad coordinates (mm)
    const x = 95.25 + junction.x * 25.4
    const y = 73.66 + junction.y * 25.4

    const kicadJunction = new Junction({
      at: [x, y, 0],
      diameter: 0, // 0 means use default diameter
    })

    // Generate UUID for the junction
    kicadJunction.uuid = crypto.randomUUID()

    return kicadJunction
  }

  override getOutput(): KicadSch {
    return this.ctx.kicadSch
  }
}
