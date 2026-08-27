import type { CircuitJson } from "circuit-json"
import type { KicadSch } from "kicadts"
import { Wire, Pts, Xy, Stroke, Junction, Uuid } from "kicadts"
import { applyToPoint } from "transformation-matrix"
import { ConverterStage, type ConverterContext } from "../../types"

const DEFAULT_LINE_WIDTH_MM = 0.254
const PIN_SNAP_TOLERANCE_MM = 0.01

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
    const from = this.snapTraceEndpointToPinAnchor(edge.from)
    const to = this.snapTraceEndpointToPinAnchor(edge.to)

    const x1 = from.x
    const y1 = from.y
    const x2 = to.x
    const y2 = to.y

    // Create points for the wire
    const pts = new Pts([new Xy(x1, y1), new Xy(x2, y2)])
    wire.points = pts

    // Create stroke for the wire
    const stroke = new Stroke()
    stroke.width = DEFAULT_LINE_WIDTH_MM
    stroke.type = "default"
    wire.stroke = stroke

    // Generate UUID for the wire
    wire.uuid = crypto.randomUUID()

    return wire
  }

  private snapTraceEndpointToPinAnchor(point: { x: number; y: number }) {
    if (!this.ctx.c2kMatSch) {
      throw new Error(
        "Schematic transformation matrix not initialized in context",
      )
    }

    const transformedPoint = applyToPoint(this.ctx.c2kMatSch, point)
    const pinAnchorMappings = this.getPinAnchorMappings()

    let nearestMapping:
      | {
          raw: { x: number; y: number }
          actual: { x: number; y: number }
        }
      | undefined
    let nearestDistanceSquared = Number.POSITIVE_INFINITY

    for (const mapping of pinAnchorMappings) {
      const dx = transformedPoint.x - mapping.raw.x
      const dy = transformedPoint.y - mapping.raw.y
      const distanceSquared = dx * dx + dy * dy

      if (
        distanceSquared <= PIN_SNAP_TOLERANCE_MM * PIN_SNAP_TOLERANCE_MM &&
        distanceSquared < nearestDistanceSquared
      ) {
        nearestMapping = mapping
        nearestDistanceSquared = distanceSquared
      }
    }

    return nearestMapping?.actual ?? transformedPoint
  }

  private getPinAnchorMappings() {
    const mappings: Array<{
      raw: { x: number; y: number }
      actual: { x: number; y: number }
    }> = []

    for (const schematicPort of this.ctx.db.schematic_port.list()) {
      const actualPosition = this.ctx.pinPositions?.get(
        schematicPort.schematic_port_id,
      )
      if (!actualPosition) continue
      mappings.push({
        raw: applyToPoint(this.ctx.c2kMatSch!, {
          x: schematicPort.center.x,
          y: schematicPort.center.y,
        }),
        actual: actualPosition,
      })
    }

    return mappings
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
      at: [x, y],
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
