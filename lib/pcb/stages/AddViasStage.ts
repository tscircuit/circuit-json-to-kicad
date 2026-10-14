import type { CircuitJson } from "circuit-json"
import type { KicadPcb } from "kicadts"
import { Via, ViaNet } from "kicadts"
import {
  ConverterStage,
  type ConverterContext,
  type PcbNetInfo,
} from "../../types"
import { applyToPoint } from "transformation-matrix"
import { isRouteViaInPhysicalVia } from "../utils/isRouteViaInPhysicalVia"
import { generateDeterministicUuid } from "./utils/generateDeterministicUuid"
import {
  getKicadLayer,
  getViaLayers,
  getViaLayerSpan,
} from "../utils/layerMapping"

type ViaLike = {
  x: number
  y: number
  outer_diameter?: number
  hole_diameter?: number
  layers?: string[]
  from_layer?: string
  to_layer?: string
  pcb_trace_id?: string
  source_net_id?: string
  subcircuit_connectivity_map_key?: string
}

/**
 * Adds vias to the PCB from circuit JSON
 */
export class AddViasStage extends ConverterStage<CircuitJson, KicadPcb> {
  private viasProcessed = 0
  private pcbVias: ViaLike[] = []

  constructor(input: CircuitJson, ctx: ConverterContext) {
    super(input, ctx)
    this.pcbVias = this.collectPcbVias()
  }

  private collectPcbVias(): ViaLike[] {
    const numLayers = this.ctx.db.pcb_board.list()[0]?.num_layers ?? 2
    const standaloneVias = this.ctx.db.pcb_via.list()
    const routeDefinedVias: ViaLike[] = []
    for (const trace of this.ctx.db.pcb_trace.list()) {
      let connectivityKey: string | undefined
      if (trace.source_trace_id) {
        connectivityKey = this.ctx.db.source_trace.get(
          trace.source_trace_id,
        )?.subcircuit_connectivity_map_key
      }
      for (const point of trace.route) {
        if (point.route_type !== "via") continue
        if (
          standaloneVias.some(
            (via) =>
              (via.pcb_trace_id === trace.pcb_trace_id ||
                (connectivityKey !== undefined &&
                  via.subcircuit_connectivity_map_key === connectivityKey)) &&
              isRouteViaInPhysicalVia({
                physicalVia: via,
                routeVia: point,
                numLayers,
              }),
          )
        )
          continue

        if (
          routeDefinedVias.some(
            (via) =>
              via.pcb_trace_id === trace.pcb_trace_id &&
              via.x === point.x &&
              via.y === point.y &&
              via.outer_diameter === point.outer_diameter &&
              via.hole_diameter === point.hole_diameter &&
              ((via.from_layer === point.from_layer &&
                via.to_layer === point.to_layer) ||
                (via.from_layer === point.to_layer &&
                  via.to_layer === point.from_layer)),
          )
        )
          continue

        routeDefinedVias.push({
          x: point.x,
          y: point.y,
          outer_diameter: point.outer_diameter,
          hole_diameter: point.hole_diameter,
          from_layer: point.from_layer,
          to_layer: point.to_layer,
          pcb_trace_id: trace.pcb_trace_id,
        })
      }
    }
    return [...standaloneVias, ...routeDefinedVias]
  }

  private getRawViaLayers(via: ViaLike): string[] {
    if (via.layers?.length) {
      return [...via.layers]
    }

    return [via.from_layer, via.to_layer].filter((layer): layer is string =>
      Boolean(layer),
    )
  }

  private getKicadViaLayers(via: ViaLike): string[] {
    const rawLayers = this.getRawViaLayers(via)
    const numLayers = this.ctx.numLayers ?? 2
    const kicadLayers =
      rawLayers.length > 0
        ? rawLayers.map((layer) => getKicadLayer(layer))
        : getViaLayers(numLayers)

    // KiCad vias must list exactly two layers (top-most + bottom-most span);
    // Circuit JSON may enumerate every traversed copper layer.
    return getViaLayerSpan(kicadLayers, numLayers)
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
    if (!via) {
      this.finished = true
      return
    }

    // Transform the via position to KiCad coordinates
    const transformedPos = applyToPoint(c2kMatPcb, {
      x: via.x,
      y: via.y,
    })

    let netInfo: PcbNetInfo | undefined
    if (pcbNetMap) {
      let connectivityKey: string | undefined =
        via.subcircuit_connectivity_map_key

      if (!connectivityKey && via.source_net_id) {
        const sourceNet = this.ctx.db.source_net?.get(via.source_net_id)
        if (sourceNet) {
          connectivityKey =
            sourceNet.subcircuit_connectivity_map_key || sourceNet.source_net_id
        }
      }

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
                  if (sourceNet) {
                    connectivityKey =
                      sourceNet.subcircuit_connectivity_map_key ||
                      sourceNet.source_net_id
                    break
                  }
                }
              }
            }
            // Bug 1 fix: source_trace_id may actually be a source_net ID
            // (capacity-autorouter sets it this way)
            if (!connectivityKey) {
              const sourceNet = this.ctx.db.source_net?.get(
                pcbTrace.source_trace_id,
              )
              if (sourceNet) {
                connectivityKey =
                  sourceNet.subcircuit_connectivity_map_key ||
                  sourceNet.source_net_id
              }
            }
          }
        }
      }

      if (connectivityKey) {
        netInfo = pcbNetMap.get(connectivityKey)
      }
    }

    // Get via layers based on board layer count
    // For through-hole vias, span all copper layers
    const viaLayers = this.getKicadViaLayers(via)

    // Preserve explicit Circuit JSON via dimensions; only fall back when absent.
    const viaSize = via.outer_diameter ?? 0.8
    const viaDrill = via.hole_diameter ?? 0.4

    // Create a via with deterministic UUID
    const viaData = `via:${transformedPos.x},${transformedPos.y}:${viaSize}:${viaDrill}:${netInfo?.id ?? 0}`
    const kicadVia = new Via({
      at: [transformedPos.x, transformedPos.y],
      size: viaSize,
      drill: viaDrill,
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
