import type { CircuitJson } from "circuit-json"
import type { KicadSch } from "kicadts"
import { Junction, Label, Pts, Stroke, Uuid, Wire, Xy } from "kicadts"
import { applyToPoint } from "transformation-matrix"
import { type ConverterContext, ConverterStage } from "../../types"
import {
  getSourceTraceConnectivityKey,
  getUnnamedNetName,
} from "../../utils/getUnnamedNetName"
import { createTextEffects } from "./symbols-stage-converters/createTextEffects"

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
    const labels: Label[] = []
    const unnamedNetNames = this.getUnnamedNetNames()
    const labeledKeys = new Set<string>()

    // Process each trace
    for (const schematicTrace of schematicTraces) {
      // Add wires for each edge in the trace
      for (const edge of schematicTrace.edges) {
        const wire = this.createWireFromEdge(edge)
        wires.push(wire)
      }

      // Name nets that only exist as traces, so KiCad doesn't auto-name them
      // differently from the PCB.
      const key = schematicTrace.subcircuit_connectivity_map_key
      const netName = key ? unnamedNetNames.get(key) : undefined
      const firstEdge = schematicTrace.edges[0]
      if (key && netName && firstEdge && !labeledKeys.has(key)) {
        labeledKeys.add(key)
        labels.push(this.createNetNameLabel(netName, firstEdge.from))
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
    kicadSch.labels = [...(kicadSch.labels || []), ...labels]

    this.finished = true
  }

  /**
   * Names the PCB converter gives to nets that have no source_net, by
   * connectivity key.
   */
  private getUnnamedNetNames(): Map<string, string> {
    const { db } = this.ctx
    const namedKeys = new Set<string>()
    for (const sourceNet of db.source_net?.list() ?? []) {
      namedKeys.add(
        sourceNet.subcircuit_connectivity_map_key || sourceNet.source_net_id,
      )
    }
    const names = new Map<string, string>()
    for (const sourceTrace of db.source_trace?.list() ?? []) {
      const key = getSourceTraceConnectivityKey(db, sourceTrace)
      if (!key || namedKeys.has(key) || names.has(key)) continue
      names.set(key, getUnnamedNetName(sourceTrace, key))
    }
    return names
  }

  private createNetNameLabel(
    name: string,
    position: { x: number; y: number },
  ): Label {
    const { x, y } = applyToPoint(this.ctx.c2kMatSch!, position)
    return new Label({
      value: name,
      at: [x, y, 0],
      effects: createTextEffects(1.27, false),
      uuid: crypto.randomUUID(),
    })
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
