import {
  createBoardOwnerMap,
  isRouteViaCoveredByPhysicalVia,
} from "@tscircuit/circuit-json-util"
import type { CircuitJson } from "circuit-json"
import type { KicadPcb } from "kicadts"
import { Via, ViaNet } from "kicadts"
import { ConverterStage, type PcbNetInfo } from "../../types"
import { applyToPoint } from "transformation-matrix"
import { generateDeterministicUuid } from "./utils/generateDeterministicUuid"
import { createViaTenting } from "./utils/createViaTenting"
import {
  getKicadLayer,
  getViaLayers,
  getViaLayerSpan,
} from "../utils/layerMapping"

const DEFAULT_VIA_OUTER_DIAMETER = 0.8
const DEFAULT_VIA_HOLE_DIAMETER = 0.4

type ViaLike = {
  pcb_via_id?: string
  // Resolved KiCad net shared by duplicate matching and export.
  net?: PcbNetInfo
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
  private boardOwnerMap?: ReturnType<typeof createBoardOwnerMap>
  private viasProcessed = 0
  private pcbVias?: ViaLike[]

  private collectPcbVias(): ViaLike[] {
    const { pcbNetMap } = this.ctx
    const standaloneVias: ViaLike[] = this.ctx.db.pcb_via.list().map((via) => ({
      ...via,
      net: pcbNetMap?.get(
        via.subcircuit_connectivity_map_key ||
          via.source_net_id ||
          via.pcb_via_id,
      ),
    }))
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
              net:
                pcbNetMap?.get(trace.pcb_trace_id) ??
                pcbNetMap?.get(trace.connection_name),
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
              physicalVias?.some((physicalVia) => {
                const sameTrace =
                  physicalVia.pcb_trace_id !== undefined &&
                  physicalVia.pcb_trace_id === via.pcb_trace_id
                const physicalConnection =
                  physicalVia.net?.id ??
                  physicalVia.subcircuit_connectivity_map_key
                const routeConnection =
                  via.net?.id ?? via.subcircuit_connectivity_map_key
                if (
                  physicalConnection !== undefined &&
                  routeConnection !== undefined
                ) {
                  if (physicalConnection !== routeConnection) return false
                } else if (!sameTrace) {
                  return false
                }

                return isRouteViaCoveredByPhysicalVia(physicalVia, via)
              })
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

  private getRouteViaDedupeKey(via: ViaLike): string | undefined {
    const connectivityKey = via.net?.id ?? via.subcircuit_connectivity_map_key
    const connection =
      connectivityKey !== undefined
        ? ["net", connectivityKey]
        : via.pcb_trace_id !== undefined
          ? ["trace", via.pcb_trace_id]
          : undefined
    if (connection === undefined) return undefined

    // Route-only vias must match their connection, dimensions, and full span.
    const span = [...this.getKicadViaLayers(via)].sort().join(",")
    return JSON.stringify([
      via.x,
      via.y,
      span,
      connection,
      via.outer_diameter ?? DEFAULT_VIA_OUTER_DIAMETER,
      via.hole_diameter ?? DEFAULT_VIA_HOLE_DIAMETER,
    ])
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
    const { kicadPcb, c2kMatPcb } = this.ctx

    if (!kicadPcb) {
      throw new Error("KicadPcb instance not initialized in context")
    }

    if (!c2kMatPcb) {
      throw new Error("PCB transformation matrix not initialized in context")
    }

    // AddNetsStage has populated the element-to-net map before this stage runs.
    this.pcbVias ??= this.collectPcbVias()

    if (this.viasProcessed >= this.pcbVias.length) {
      this.finished = true
      return
    }

    const via = this.pcbVias[this.viasProcessed]
    if (!via) {
      this.finished = true
      return
    }

    this.boardOwnerMap ??= createBoardOwnerMap(this.input)
    const boardOwnerId = via.pcb_via_id ?? via.pcb_trace_id
    const board = boardOwnerId
      ? this.boardOwnerMap.get(boardOwnerId)
      : undefined

    // Transform the via position to KiCad coordinates
    const transformedPos = applyToPoint(c2kMatPcb, {
      x: via.x,
      y: via.y,
    })

    // Get via layers based on board layer count
    // For through-hole vias, span all copper layers
    const viaLayers = this.getKicadViaLayers(via)

    // Preserve explicit Circuit JSON via dimensions; only fall back when absent.
    const viaSize = via.outer_diameter ?? DEFAULT_VIA_OUTER_DIAMETER
    const viaDrill = via.hole_diameter ?? DEFAULT_VIA_HOLE_DIAMETER

    // Create a via with deterministic UUID
    const viaData = `via:${transformedPos.x},${transformedPos.y}:${viaSize}:${viaDrill}:${via.net?.id ?? 0}`
    const kicadVia = new Via({
      at: [transformedPos.x, transformedPos.y],
      size: viaSize,
      drill: viaDrill,
      layers: viaLayers,
      net: new ViaNet(via.net?.id ?? 0),
      uuid: generateDeterministicUuid(viaData),
      tenting: createViaTenting(via, board),
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
