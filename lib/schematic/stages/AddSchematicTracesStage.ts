import type { CircuitJson } from "circuit-json"
import type { KicadSch } from "kicadts"
import { Junction, Pts, Stroke, Uuid, Wire, Xy } from "kicadts"
import { applyToPoint } from "transformation-matrix"
import { type ConverterContext, ConverterStage } from "../../types"

const DEFAULT_LINE_WIDTH_MM = 0.254

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
    const netLabels = db.schematic_net_label?.list?.() || []

    // Process each trace
    for (const schematicTrace of schematicTraces) {
      const traceConnectivityKey =
        schematicTrace.subcircuit_connectivity_map_key
      const netLabelAnchors = traceConnectivityKey
        ? netLabels
            .filter((netLabel) => {
              if (!netLabel.symbol_name) return false
              if (
                (netLabel.schematic_sheet_id ?? null) !==
                (schematicTrace.schematic_sheet_id ?? null)
              ) {
                return false
              }
              const sourceNet = netLabel.source_net_id
                ? db.source_net.get(netLabel.source_net_id)
                : undefined
              return (
                sourceNet?.subcircuit_connectivity_map_key !==
                traceConnectivityKey
              )
            })
            .map((netLabel) => netLabel.anchor_position ?? netLabel.center)
            .filter(
              (point): point is { x: number; y: number } =>
                point !== undefined &&
                typeof point.x === "number" &&
                typeof point.y === "number",
            )
        : []

      // Add wires for each edge in the trace, splitting at interior net label anchors
      for (const edge of schematicTrace.edges) {
        for (const segment of this.splitEdgeAtPoints(edge, netLabelAnchors)) {
          const wire = this.createWireFromEdge(segment)
          wires.push(wire)
        }
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
   * Split a schematic trace edge at any interior net-label anchor points so
   * KiCad connects mid-wire power symbols and global labels to the wire.
   */
  private splitEdgeAtPoints(
    edge: { from: { x: number; y: number }; to: { x: number; y: number } },
    points: Array<{ x: number; y: number }>,
  ): Array<{ from: { x: number; y: number }; to: { x: number; y: number } }> {
    const dx = edge.to.x - edge.from.x
    const dy = edge.to.y - edge.from.y
    const lengthSq = dx * dx + dy * dy
    if (lengthSq < 1e-12 || points.length === 0) {
      return [edge]
    }

    const interiorSplits: Array<{
      t: number
      point: { x: number; y: number }
    }> = []
    for (const point of points) {
      if (
        Math.hypot(point.x - edge.from.x, point.y - edge.from.y) <= 1e-5 ||
        Math.hypot(point.x - edge.to.x, point.y - edge.to.y) <= 1e-5
      ) {
        continue
      }
      const t =
        ((point.x - edge.from.x) * dx + (point.y - edge.from.y) * dy) / lengthSq
      if (t <= 1e-6 || t >= 1 - 1e-6) continue
      const projX = edge.from.x + t * dx
      const projY = edge.from.y + t * dy
      if (Math.hypot(point.x - projX, point.y - projY) <= 1e-5) {
        interiorSplits.push({ t, point: { x: point.x, y: point.y } })
      }
    }

    if (interiorSplits.length === 0) {
      return [edge]
    }

    interiorSplits.sort((a, b) => a.t - b.t)
    const vertices: Array<{ x: number; y: number }> = [edge.from]
    for (const split of interiorSplits) {
      const prev = vertices[vertices.length - 1]!
      if (Math.hypot(split.point.x - prev.x, split.point.y - prev.y) > 1e-5) {
        vertices.push(split.point)
      }
    }
    vertices.push(edge.to)

    const segments: Array<{
      from: { x: number; y: number }
      to: { x: number; y: number }
    }> = []
    for (let i = 0; i < vertices.length - 1; i++) {
      segments.push({ from: vertices[i]!, to: vertices[i + 1]! })
    }
    return segments
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

    // Create stroke for the wire
    const stroke = new Stroke()
    stroke.width = DEFAULT_LINE_WIDTH_MM
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
