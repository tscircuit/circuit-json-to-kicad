import type { CircuitJson } from "circuit-json"
import type { KicadPcb } from "kicadts"
import { Via, ViaNet } from "kicadts"
import {
  ConverterStage,
  type ConverterContext,
  type PcbNetInfo,
} from "../../types"
import { applyToPoint } from "transformation-matrix"
import { generateDeterministicUuid } from "./utils/generateDeterministicUuid"
import { getViaLayers } from "../utils/layerMapping"

/**
 * Adds vias to the PCB from circuit JSON
 */
export class AddViasStage extends ConverterStage<CircuitJson, KicadPcb> {
  private viasProcessed = 0
  private pcbVias: any[] = []

  constructor(input: CircuitJson, ctx: ConverterContext) {
    super(input, ctx)
    // Get all PCB vias from circuit JSON if they exist
    this.pcbVias = this.ctx.db.pcb_via?.list() || []
  }

  override _step(): void {
    const { kicadPcb, c2kMatPcb, pcbNetMap } = this.ctx

    if (!kicadPcb) {
      throw new Error("KicadPcb instance not initialized in context")
    }

    if (!c2kMatPcb) {
      throw new Error("PCB transformation matrix not initialized in context")
    }

    if (this.viasProcessed >= this.pcbVias.length) {
      this.finished = true
      return
    }

    const via = this.pcbVias[this.viasProcessed]

    // Transform the via position to KiCad coordinates
    const transformedPos = applyToPoint(c2kMatPcb, {
      x: via.x,
      y: via.y,
    })

    let netInfo: PcbNetInfo | undefined
    if (pcbNetMap) {
      let connectivityKey: string | undefined =
        via.subcircuit_connectivity_map_key

      if (!connectivityKey && via.pcb_trace_id) {
        const pcbTrace = this.ctx.db.pcb_trace?.get(via.pcb_trace_id)
        if (pcbTrace) {
          if ("subcircuit_connectivity_map_key" in pcbTrace) {
            connectivityKey = (pcbTrace as any).subcircuit_connectivity_map_key
          }
          if (!connectivityKey && pcbTrace.source_trace_id) {
            const sourceTrace = this.ctx.db.source_trace?.get(
              pcbTrace.source_trace_id,
            )
            if (sourceTrace) {
              if ("subcircuit_connectivity_map_key" in sourceTrace) {
                connectivityKey = (sourceTrace as any)
                  .subcircuit_connectivity_map_key
              }
              if (
                !connectivityKey &&
                sourceTrace.connected_source_net_ids?.length
              ) {
                for (const sourceNetId of sourceTrace.connected_source_net_ids) {
                  const sourceNet = this.ctx.db.source_net?.get(sourceNetId)
                  if (sourceNet?.subcircuit_connectivity_map_key) {
                    connectivityKey = sourceNet.subcircuit_connectivity_map_key
                    break
                  }
                }
              }
            }
          }
        }
      }

      if (!connectivityKey && via.connection_name) {
        const sourceNet = this.ctx.db.source_net?.get(via.connection_name)
        if (sourceNet?.subcircuit_connectivity_map_key) {
          connectivityKey = sourceNet.subcircuit_connectivity_map_key
        }
      }

      if (connectivityKey) {
        netInfo = pcbNetMap.get(connectivityKey)
      }
    }

    // Get via layers based on board layer count
    // For through-hole vias, span all copper layers
    const numLayers = this.ctx.numLayers ?? 2
    const viaLayers = via.layers
      ? via.layers.map((l: string) =>
          l === "top" ? "F.Cu" : l === "bottom" ? "B.Cu" : `In${l.replace("inner", "")}.Cu`,
        )
      : getViaLayers(numLayers)

    // Create a via with deterministic UUID
    const viaData = `via:${transformedPos.x},${transformedPos.y}:${via.outer_diameter || 0.8}:${via.hole_diameter || 0.4}:${netInfo?.id ?? 0}`
    const kicadVia = new Via({
      at: [transformedPos.x, transformedPos.y],
      size: via.outer_diameter || 0.8,
      drill: via.hole_diameter || 0.4,
      layers: viaLayers,
      net: new ViaNet(netInfo?.id ?? 0),
      uuid: generateDeterministicUuid(viaData),
    })

    // Add the via to the PCB
    const vias = kicadPcb.vias
    vias.push(kicadVia)
    kicadPcb.vias = vias

    this.viasProcessed++
  }

  override getOutput(): KicadPcb {
    return this.ctx.kicadPcb!
  }
}
