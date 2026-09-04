import type { CircuitJson } from "circuit-json"
import type { KicadPcb } from "kicadts"
import { Via, ViaNet } from "kicadts"
import { ConverterStage, type ConverterContext } from "../../types"
import { applyToPoint } from "transformation-matrix"
import { generateDeterministicUuid } from "./utils/generateDeterministicUuid"
import {
  getKicadLayer,
  getKicadCopperLayerIndex,
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
  subcircuit_connectivity_map_key?: string
  connection_name?: string
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
    const seenViaKeys = new Set<string>()
    const physicalVias = this.ctx.db.pcb_via.list()
    const standaloneVias = physicalVias.filter((via) => {
      const viaKey = this.getViaDedupeKey(via)
      if (seenViaKeys.has(viaKey)) return false
      seenViaKeys.add(viaKey)
      return true
    })

    const routeDefinedVias = (this.ctx.db.pcb_trace?.list() || []).flatMap(
      (trace: any) =>
        (trace.route || [])
          .filter((point: any) => point.route_type === "via")
          .map(
            (point: any): ViaLike => ({
              x: point.x,
              y: point.y,
              outer_diameter: point.outer_diameter ?? point.via_diameter,
              hole_diameter: point.hole_diameter ?? point.via_hole_diameter,
              from_layer: point.from_layer,
              to_layer: point.to_layer,
              pcb_trace_id: trace.pcb_trace_id,
              subcircuit_connectivity_map_key:
                trace.subcircuit_connectivity_map_key,
              connection_name: trace.connection_name,
            }),
          )
          .filter((via: ViaLike) => {
            // A route transition can use only part of an existing barrel.
            // The physical pcb_via is authoritative for that trace's drill.
            if (
              physicalVias.some(
                (physicalVia) =>
                  physicalVia.x === via.x &&
                  physicalVia.y === via.y &&
                  physicalVia.pcb_trace_id === via.pcb_trace_id &&
                  (via.outer_diameter === undefined ||
                    via.outer_diameter === physicalVia.outer_diameter) &&
                  (via.hole_diameter === undefined ||
                    via.hole_diameter === physicalVia.hole_diameter) &&
                  this.viaSpanContains(physicalVia, via),
              )
            ) {
              return false
            }
            const viaKey = this.getViaDedupeKey(via)
            if (seenViaKeys.has(viaKey)) {
              return false
            }
            seenViaKeys.add(viaKey)
            return true
          }),
    )

    return [...standaloneVias, ...routeDefinedVias]
  }

  private getViaDedupeKey(via: ViaLike): string {
    // Preserve co-located vias with different physical spans, sizes, or nets.
    const span = [...this.getKicadViaLayers(via)].sort().join(",")
    const connectivityKey = this.getViaConnectivityKey(via) ?? ""
    return `${via.x}:${via.y}:${span}:${via.outer_diameter ?? 0.8}:${via.hole_diameter ?? 0.4}:${connectivityKey}`
  }

  private viaSpanContains(physicalVia: ViaLike, routeVia: ViaLike): boolean {
    const numLayers = this.ctx.db.pcb_board.list()[0]?.num_layers ?? 2
    const [firstLayer, lastLayer] = this.getKicadViaLayers(physicalVia)
    const firstIndex = getKicadCopperLayerIndex(firstLayer!, numLayers)
    const lastIndex = getKicadCopperLayerIndex(lastLayer!, numLayers)
    return this.getKicadViaLayers(routeVia).every((layer) => {
      const layerIndex = getKicadCopperLayerIndex(layer, numLayers)
      return layerIndex >= firstIndex && layerIndex <= lastIndex
    })
  }

  private getViaConnectivityKey(via: ViaLike): string | undefined {
    if (via.subcircuit_connectivity_map_key) {
      return via.subcircuit_connectivity_map_key
    }
    const trace = via.pcb_trace_id
      ? this.ctx.db.pcb_trace.get(via.pcb_trace_id)
      : undefined
    if (
      trace &&
      "subcircuit_connectivity_map_key" in trace &&
      typeof trace.subcircuit_connectivity_map_key === "string"
    ) {
      return trace.subcircuit_connectivity_map_key
    }
    const sourceTrace = trace?.source_trace_id
      ? this.ctx.db.source_trace.get(trace.source_trace_id)
      : undefined
    if (sourceTrace?.subcircuit_connectivity_map_key) {
      return sourceTrace.subcircuit_connectivity_map_key
    }
    for (const netId of sourceTrace?.connected_source_net_ids ?? []) {
      const net = this.ctx.db.source_net.get(netId)
      if (net?.subcircuit_connectivity_map_key) {
        return net.subcircuit_connectivity_map_key
      }
    }
    for (const netId of [trace?.source_trace_id, via.connection_name]) {
      const net = netId ? this.ctx.db.source_net.get(netId) : undefined
      if (net?.subcircuit_connectivity_map_key) {
        return net.subcircuit_connectivity_map_key
      }
    }
    return undefined
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
    const numLayers =
      this.ctx.numLayers ?? this.ctx.db.pcb_board.list()[0]?.num_layers ?? 2
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

    const connectivityKey = this.getViaConnectivityKey(via)
    const netInfo = connectivityKey
      ? pcbNetMap?.get(connectivityKey)
      : undefined

    // Get via layers based on board layer count
    // For through-hole vias, span all copper layers
    const viaLayers = this.getKicadViaLayers(via)

    // Preserve explicit Circuit JSON via dimensions; only fall back when absent.
    const viaSize = via.outer_diameter ?? 0.8
    const viaDrill = via.hole_diameter ?? 0.4

    // Create a via with deterministic UUID
    const isThroughVia = viaLayers[0] === "F.Cu" && viaLayers[1] === "B.Cu"
    const viaData = `via:${transformedPos.x},${transformedPos.y}:${viaSize}:${viaDrill}:${netInfo?.id ?? 0}${isThroughVia ? "" : `:${viaLayers.join(",")}`}`
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
