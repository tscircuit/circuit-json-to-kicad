import type { CircuitJson } from "circuit-json"
import type { KicadPcb } from "kicadts"
import { Via, ViaNet } from "kicadts"
import { ConverterStage, type ConverterContext } from "../../types"
import { applyToPoint } from "transformation-matrix"
import { generateDeterministicUuid } from "./utils/generateDeterministicUuid"
import { createViaTenting } from "./utils/createViaTenting"
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
  source_net_id?: string
  subcircuit_connectivity_map_key?: string
  connection_name?: string
  tented_on_top?: boolean
  tented_on_bottom?: boolean
  is_tented?: boolean
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
    const standaloneVias = (this.ctx.db.pcb_via?.list() || []) as ViaLike[]
    const seenRouteViaKeys = new Set<string>()
    const standaloneViasByPosition = new Map<string, ViaLike[]>()
    for (const via of standaloneVias) {
      const positionKey = `${via.x}:${via.y}`
      const viasAtPosition = standaloneViasByPosition.get(positionKey) ?? []
      viasAtPosition.push(via)
      standaloneViasByPosition.set(positionKey, viasAtPosition)
    }

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
              tented_on_top: point.tented_on_top,
              tented_on_bottom: point.tented_on_bottom,
            }),
          )
          .filter((via: ViaLike) => {
            const physicalVias = standaloneViasByPosition.get(
              `${via.x}:${via.y}`,
            )
            if (
              physicalVias?.some((physicalVia) =>
                this.physicalViaCoversRouteVia(physicalVia, via),
              )
            ) {
              return false
            }
            const viaKey = this.getRouteViaDedupeKey(via)
            if (viaKey !== undefined) {
              if (seenRouteViaKeys.has(viaKey)) return false
              seenRouteViaKeys.add(viaKey)
            }
            return true
          }),
    )

    return [...standaloneVias, ...routeDefinedVias]
  }

  private physicalViaCoversRouteVia(
    physicalVia: ViaLike,
    routeVia: ViaLike,
  ): boolean {
    const sameTrace =
      physicalVia.pcb_trace_id !== undefined &&
      physicalVia.pcb_trace_id === routeVia.pcb_trace_id
    const physicalConnection = this.getViaConnectivityKey(physicalVia)
    const routeConnection = this.getViaConnectivityKey(routeVia)
    if (physicalConnection !== undefined && routeConnection !== undefined) {
      if (physicalConnection !== routeConnection) return false
    } else if (!sameTrace) {
      return false
    }

    if (
      (routeVia.outer_diameter !== undefined &&
        routeVia.outer_diameter !== physicalVia.outer_diameter) ||
      (routeVia.hole_diameter !== undefined &&
        routeVia.hole_diameter !== physicalVia.hole_diameter)
    ) {
      return false
    }

    // A route records the layers used by the trace, while pcb_via.layers
    // describes the physical drilled span. The physical via is authoritative
    // when it already covers this transition on the same connection.
    const numLayers = this.ctx.numLayers ?? 2
    const physicalSpan = this.getKicadViaLayers(physicalVia).map((layer) =>
      getKicadCopperLayerIndex(layer, numLayers),
    )
    const routeSpan = this.getKicadViaLayers(routeVia).map((layer) =>
      getKicadCopperLayerIndex(layer, numLayers),
    )
    return (
      physicalSpan.length === 2 &&
      routeSpan.length === 2 &&
      physicalSpan[0]! <= routeSpan[0]! &&
      physicalSpan[1]! >= routeSpan[1]!
    )
  }

  private getRouteViaDedupeKey(via: ViaLike): string | undefined {
    const connectivityKey = this.getViaConnectivityKey(via)
    const connection =
      connectivityKey !== undefined
        ? `net:${connectivityKey}`
        : via.pcb_trace_id !== undefined
          ? `trace:${via.pcb_trace_id}`
          : undefined
    if (connection === undefined) return undefined

    // Route-only vias must match their connection, dimensions, and full span.
    const span = [...this.getKicadViaLayers(via)].sort().join(",")
    return JSON.stringify([
      via.x,
      via.y,
      span,
      connection,
      via.outer_diameter,
      via.hole_diameter,
    ])
  }

  private getViaConnectivityKey(via: ViaLike): string | undefined {
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

    if (!connectivityKey && via.connection_name) {
      const sourceNet = this.ctx.db.source_net?.get(via.connection_name)
      if (sourceNet) {
        connectivityKey =
          sourceNet.subcircuit_connectivity_map_key || sourceNet.source_net_id
      }
    }

    return connectivityKey
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
    const viaData = `via:${transformedPos.x},${transformedPos.y}:${viaSize}:${viaDrill}:${netInfo?.id ?? 0}`
    const kicadVia = new Via({
      at: [transformedPos.x, transformedPos.y],
      size: viaSize,
      drill: viaDrill,
      layers: viaLayers,
      net: new ViaNet(netInfo?.id ?? 0),
      uuid: generateDeterministicUuid(viaData),
      tenting: createViaTenting(via),
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
