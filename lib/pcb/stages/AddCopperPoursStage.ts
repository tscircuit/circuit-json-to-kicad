import type { CircuitJson } from "circuit-json"
import { type KicadPcb, parseKicadSexpr, Zone } from "kicadts"
import {
  ConverterStage,
  type ConverterContext,
  type PcbNetInfo,
} from "../../types"
import { applyToPoint } from "transformation-matrix"
import { generateDeterministicUuid } from "./utils/generateDeterministicUuid"
import { getKicadLayer } from "../utils/layerMapping"

interface PourLike {
  pcb_copper_pour_id?: string
  layer?: string
  source_net_id?: string
  shape?: string
  brep_shape?: {
    outer_ring?: { vertices: { x: number; y: number }[] }
    inner_rings?: { vertices: { x: number; y: number }[] }[]
  }
  // Some pours may also carry the outline directly (older shape variant).
  outline?: { x: number; y: number }[]
}

const escapeNetName = (name: string): string =>
  name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')

const formatXy = (x: number, y: number): string =>
  `(xy ${x.toFixed(6)} ${y.toFixed(6)})`

/**
 * Adds copper pour zones to the PCB from circuit JSON `pcb_copper_pour`
 * records. Each pour is translated to a KiCad `(zone …)` block with the
 * outer-ring polygon as the zone outline; inner rings (cutouts) are
 * preserved as additional `(polygon …)` children so KiCad can subtract
 * them when refilling.
 *
 * KiCad's pcbnew will compute the actual filled copper at refill time
 * from the outline + connect_pads/min_thickness/clearance settings.
 */
export class AddCopperPoursStage extends ConverterStage<CircuitJson, KicadPcb> {
  private poursProcessed = 0
  private pours: PourLike[] = []

  constructor(input: CircuitJson, ctx: ConverterContext) {
    super(input, ctx)
    this.pours = (this.ctx.db.pcb_copper_pour?.list() ?? []) as PourLike[]
  }

  override _step(): void {
    const { kicadPcb, c2kMatPcb, pcbNetMap } = this.ctx

    if (!kicadPcb) {
      throw new Error("KicadPcb instance not initialized in context")
    }
    if (!c2kMatPcb) {
      throw new Error("PCB transformation matrix not initialized in context")
    }

    if (this.poursProcessed >= this.pours.length) {
      this.finished = true
      return
    }

    const pour = this.pours[this.poursProcessed]
    if (!pour) {
      this.finished = true
      return
    }

    const outerVertices =
      pour.brep_shape?.outer_ring?.vertices ?? pour.outline ?? []
    if (outerVertices.length < 3) {
      // Not a renderable polygon — skip.
      this.poursProcessed++
      return
    }

    const innerRings = pour.brep_shape?.inner_rings ?? []

    // Resolve the KiCad net via the source_net's connectivity key.
    let netInfo: PcbNetInfo | undefined
    if (pcbNetMap && pour.source_net_id) {
      const sourceNet = this.ctx.db.source_net?.get(pour.source_net_id)
      const connectivityKey =
        sourceNet?.subcircuit_connectivity_map_key ?? pour.source_net_id
      if (connectivityKey) {
        netInfo = pcbNetMap.get(connectivityKey)
      }
    }

    const netId = netInfo?.id ?? 0
    const netName = netInfo?.name ?? ""
    const kicadLayer = getKicadLayer(pour.layer)

    const transformVertices = (
      vertices: { x: number; y: number }[],
    ): string => {
      const xys = vertices
        .map((v) => {
          const p = applyToPoint(c2kMatPcb, { x: v.x, y: v.y })
          return formatXy(p.x, p.y)
        })
        .join(" ")
      return `(pts ${xys})`
    }

    const polygonChildren = [
      `(polygon ${transformVertices(outerVertices)})`,
      ...innerRings
        .filter((r) => r?.vertices?.length >= 3)
        .map((r) => `(polygon ${transformVertices(r.vertices)})`),
    ].join("\n  ")

    const uuidSeed = `copper_pour:${pour.pcb_copper_pour_id ?? this.poursProcessed}:${kicadLayer}:${netId}`
    const uuid = generateDeterministicUuid(uuidSeed)

    const zoneSexpr = `(zone
  (net ${netId})
  (net_name "${escapeNetName(netName)}")
  (layer "${kicadLayer}")
  (uuid "${uuid}")
  (hatch edge 0.5)
  (connect_pads (clearance 0.2))
  (min_thickness 0.25)
  (filled_areas_thickness no)
  (fill yes (thermal_gap 0.5) (thermal_bridge_width 0.5))
  ${polygonChildren}
)`

    const parsed = parseKicadSexpr(zoneSexpr)
    const zone = parsed[0]
    if (zone instanceof Zone) {
      const zones = kicadPcb.zones
      zones.push(zone)
      kicadPcb.zones = zones
    }

    this.poursProcessed++
  }

  override getOutput(): KicadPcb {
    return this.ctx.kicadPcb!
  }
}
