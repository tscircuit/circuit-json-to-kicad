import type { CircuitJson } from "circuit-json"
import type { KicadSch } from "kicadts"
import { Wire, Pts, Xy, Stroke, Junction, Uuid } from "kicadts"
import { applyToPoint } from "transformation-matrix"
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

    if (!kicadSch) {
      throw new Error("KicadSch instance not initialized in context")
    }

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

    if (!this.ctx.c2kMatSch) {
      throw new Error(
        "Schematic transformation matrix not initialized in context",
      )
    }

    // Transform circuit-json coordinates to KiCad coordinates using c2kMatSch
    const from = applyToPoint(this.ctx.c2kMatSch, {
      x: edge.from.x,
      y: edge.from.y,
    })
    const to = applyToPoint(this.ctx.c2kMatSch, {
      x: edge.to.x,
      y: edge.to.y,
    })

    const x1 = from.x
    const y1 = from.y
    const x2 = to.x
    const y2 = to.y

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
    if (!this.ctx.c2kMatSch) {
      throw new Error(
        "Schematic transformation matrix not initialized in context",
      )
    }

    // Transform circuit-json coordinates to KiCad coordinates using c2kMatSch
    const { x, y } = applyToPoint(this.ctx.c2kMatSch, {
      x: junction.x,
      y: junction.y,
    })

    const kicadJunction = new Junction({
      at: [x, y, 0],
      diameter: 0, // 0 means use default diameter
    })

    // Generate UUID for the junction
    kicadJunction.uuid = crypto.randomUUID()

    return kicadJunction
  }

  override getOutput(): KicadSch {
    return this.ctx.kicadSch!
  }
}
