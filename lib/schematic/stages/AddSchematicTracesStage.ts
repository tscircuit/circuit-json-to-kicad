import type { CircuitJson } from "circuit-json"
import type { KicadSch } from "kicadts"
import {
  Wire,
  Pts,
  Xy,
  Stroke,
  Junction,
  Uuid,
  Label,
  TextEffects,
  TextEffectsFont,
  TextEffectsJustify,
} from "kicadts"
import { applyToPoint } from "transformation-matrix"
import { ConverterStage, type ConverterContext } from "../../types"
import {
  getSourceTraceConnectivityKey,
  resolveUnnamedTraceNets,
} from "../../utils/getUnnamedNetName"

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

    const unnamedNetMap = resolveUnnamedTraceNets(this.input, db)
    const labeledNetKeys = new Set<string>()

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

      // Add a hidden local net label on the first wire endpoint for unnamed nets
      // so KiCad's schematic-parity check resolves the same net name as .kicad_pcb
      let connectivityKey = schematicTrace.subcircuit_connectivity_map_key
      if (!connectivityKey && schematicTrace.source_trace_id) {
        const sourceTrace = db.source_trace?.get(schematicTrace.source_trace_id)
        if (sourceTrace) {
          connectivityKey = getSourceTraceConnectivityKey(db, sourceTrace)
        }
      }

      if (
        connectivityKey &&
        unnamedNetMap.has(connectivityKey) &&
        !labeledNetKeys.has(connectivityKey)
      ) {
        const resolvedNet = unnamedNetMap.get(connectivityKey)!
        if (!resolvedNet.hasInlineLabel && schematicTrace.edges.length > 0) {
          const firstEdge = schematicTrace.edges[0]!
          const label = this.createNetNameLabel(
            resolvedNet.labelName,
            firstEdge.from,
          )
          if (label) {
            labels.push(label)
            labeledNetKeys.add(connectivityKey)
          }
        }
      }
    }

    // Add wires and junctions to the schematic
    kicadSch.wires = wires
    kicadSch.junctions = junctions

    // Add net name labels for unnamed traces
    if (labels.length > 0) {
      kicadSch.labels = [...(kicadSch.labels || []), ...labels]
    }

    this.finished = true
  }

  /**
   * Create a hidden KiCad local net label anchored at a wire endpoint so KiCad
   * assigns a deterministic net name matching the PCB net without cluttering the SVG
   */
  private createNetNameLabel(
    netName: string,
    anchor: { x: number; y: number },
  ): Label | null {
    if (!this.ctx.c2kMatSch) return null

    const { x, y } = applyToPoint(this.ctx.c2kMatSch, {
      x: anchor.x,
      y: anchor.y,
    })

    const font = new TextEffectsFont()
    font.size = { height: 1.27, width: 1.27 }
    const effects = new TextEffects({
      font,
      hiddenText: true,
      justify: new TextEffectsJustify({
        horizontal: "left",
        vertical: "bottom",
      }),
    })

    return new Label({
      value: netName,
      at: [x, y, 0],
      effects,
      uuid: crypto.randomUUID(),
      fieldsAutoplaced: true,
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
