import type { CircuitJson } from "circuit-json"
import type { KicadSch } from "kicadts"
import { Wire, Pts, Xy, Stroke, Junction, Uuid } from "kicadts"
import { applyToPoint } from "transformation-matrix"
import { ConverterStage, type ConverterContext } from "../../types"

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
    const netLabelSymbolAnchorPoints = netLabels
      .filter(
        (netLabel: any) =>
          Boolean(netLabel.symbol_name) && !netLabel.schematic_sheet_id,
      )
      .map((netLabel: any) => ({
        x: netLabel.anchor_position?.x ?? netLabel.center?.x,
        y: netLabel.anchor_position?.y ?? netLabel.center?.y,
      }))
      .filter(
        (pt): pt is { x: number; y: number } =>
          typeof pt.x === "number" &&
          Number.isFinite(pt.x) &&
          typeof pt.y === "number" &&
          Number.isFinite(pt.y),
      )

    // Process each trace
    for (const schematicTrace of schematicTraces) {
      // Add wires for each edge in the trace, splitting at interior power/rail symbol pins
      for (const edge of schematicTrace.edges) {
        const subEdges = edge.is_crossing
          ? [edge]
          : this.splitEdgeAtInteriorPoints(edge, netLabelSymbolAnchorPoints)
        for (const subEdge of subEdges) {
          const wire = this.createWireFromEdge(subEdge)
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

  private splitEdgeAtInteriorPoints(
    edge: { from: { x: number; y: number }; to: { x: number; y: number } },
    candidatePoints: Array<{ x: number; y: number }>,
  ): Array<{ from: { x: number; y: number }; to: { x: number; y: number } }> {
    const { from, to } = edge
    const dx = to.x - from.x
    const dy = to.y - from.y
    const lengthSq = dx * dx + dy * dy
    const length = Math.sqrt(lengthSq)
    const tolerance = 1e-4

    if (length <= tolerance) {
      return [edge]
    }

    const interiorStops: Array<{
      t: number
      point: { x: number; y: number }
    }> = []

    for (const pt of candidatePoints) {
      const distFromStart = Math.hypot(pt.x - from.x, pt.y - from.y)
      const distFromEnd = Math.hypot(pt.x - to.x, pt.y - to.y)
      if (distFromStart <= tolerance || distFromEnd <= tolerance) {
        continue
      }

      const t = ((pt.x - from.x) * dx + (pt.y - from.y) * dy) / lengthSq
      if (t <= 0 || t >= 1) continue

      const perpDistance =
        Math.abs((pt.x - from.x) * dy - (pt.y - from.y) * dx) / length
      if (perpDistance > tolerance) continue

      if (
        interiorStops.some(
          (existing) =>
            Math.hypot(existing.point.x - pt.x, existing.point.y - pt.y) <=
            tolerance,
        )
      ) {
        continue
      }

      interiorStops.push({ t, point: { x: pt.x, y: pt.y } })
    }

    if (interiorStops.length === 0) {
      return [edge]
    }

    interiorStops.sort((a, b) => a.t - b.t)

    const orderedPoints = [from, ...interiorStops.map((stop) => stop.point), to]
    const segments: Array<{
      from: { x: number; y: number }
      to: { x: number; y: number }
    }> = []
    for (let i = 0; i < orderedPoints.length - 1; i++) {
      segments.push({
        from: orderedPoints[i]!,
        to: orderedPoints[i + 1]!,
      })
    }
    return segments
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
