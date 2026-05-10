import type { CircuitJson } from "circuit-json"
import type { KicadPcb } from "kicadts"
import {
  Zone,
  ZoneFill,
  ZoneHatch,
  ZoneNet,
  ZoneNetName,
  ZonePolygon,
  Pts,
  Xy,
} from "kicadts"
import { ConverterStage, type ConverterContext } from "../../types"
import { applyToPoint } from "transformation-matrix"
import { generateDeterministicUuid } from "./utils/generateDeterministicUuid"
import { getKicadLayer } from "../utils/layerMapping"

type CopperPourLike = {
  type: "pcb_copper_pour"
  pcb_copper_pour_id: string
  layer: string
  source_net_id?: string
  covered_with_solder_mask?: boolean
  shape: "rect" | "polygon" | "brep"
  // rect
  center?: { x: number; y: number }
  width?: number
  height?: number
  rotation?: number
  // polygon
  points?: Array<{ x: number; y: number }>
}

/**
 * Converts pcb_copper_pour records from circuit-json into KiCad zone blocks.
 *
 * Supports:
 *   - shape: "rect"    → 4-corner rectangular zone polygon
 *   - shape: "polygon" → arbitrary polygon zone
 *   - shape: "brep"    → currently unsupported (skipped with a warning)
 *
 * Fixes: https://github.com/tscircuit/circuit-json-to-kicad/issues/284
 */
export class AddCopperPoursStage extends ConverterStage<CircuitJson, KicadPcb> {
  private pours: CopperPourLike[] = []
  private poursProcessed = 0

  constructor(input: CircuitJson, ctx: ConverterContext) {
    super(input, ctx)
    this.pours = (this.ctx.db.pcb_copper_pour?.list() ??
      []) as CopperPourLike[]
  }

  override _step(): void {
    if (this.poursProcessed >= this.pours.length) {
      this.finished = true
      return
    }

    const { kicadPcb, c2kMatPcb, pcbNetMap } = this.ctx

    if (!kicadPcb) throw new Error("KicadPcb not initialized in context")
    if (!c2kMatPcb) throw new Error("PCB transform matrix not initialized")

    const pour = this.pours[this.poursProcessed]!
    this.poursProcessed++

    if (pour.shape === "brep") {
      // BRep pours require tessellation; skip for now.
      console.warn(
        `[AddCopperPoursStage] Skipping brep copper pour ${pour.pcb_copper_pour_id} (not yet supported)`,
      )
      return
    }

    const kicadLayer = getKicadLayer(pour.layer)

    // Resolve net info from pcbNetMap
    let netId = 0
    let netName = ""
    if (pcbNetMap && pour.source_net_id) {
      // pcbNetMap is keyed by subcircuit_connectivity_map_key; we also try
      // source_net_id directly since copper pours reference it that way.
      let netInfo = pcbNetMap.get(pour.source_net_id)
      if (!netInfo) {
        // Fall back: scan for matching source_net
        const sourceNet = this.ctx.db.source_net?.get(pour.source_net_id)
        if (sourceNet?.subcircuit_connectivity_map_key) {
          netInfo = pcbNetMap.get(sourceNet.subcircuit_connectivity_map_key)
        }
      }
      if (netInfo) {
        netId = netInfo.id
        netName = netInfo.name
      }
    }

    // Build polygon points in KiCad coordinates
    const kicadPoints = this.getKicadPoints(pour, c2kMatPcb)
    if (kicadPoints.length < 3) {
      console.warn(
        `[AddCopperPoursStage] Skipping copper pour ${pour.pcb_copper_pour_id}: fewer than 3 points`,
      )
      return
    }

    const pts = new Pts(kicadPoints.map((p) => new Xy(p.x, p.y)))
    const polygon = new ZonePolygon(pts)

    const zone = new Zone({
      net: new ZoneNet(netId),
      netName: new ZoneNetName(netName || ""),
      layer: kicadLayer,
      hatch: new ZoneHatch("edge", 0.508),
      fill: new ZoneFill({ filled: true }),
      polygons: [polygon],
    })

    // Assign a deterministic UUID derived from pour identity + layer
    const seed = `copper_pour:${pour.pcb_copper_pour_id}:${kicadLayer}`
    ;(zone as any)._sxUuid = { getString: () => `(uuid "${generateDeterministicUuid(seed)}")` }

    const zones = kicadPcb.zones ?? []
    zones.push(zone)
    kicadPcb.zones = zones
  }

  private getKicadPoints(
    pour: CopperPourLike,
    transform: import("transformation-matrix").Matrix,
  ): Array<{ x: number; y: number }> {
    if (pour.shape === "rect") {
      if (
        pour.center === undefined ||
        pour.width === undefined ||
        pour.height === undefined
      ) {
        return []
      }

      const { x: cx, y: cy } = pour.center
      const hw = pour.width / 2
      const hh = pour.height / 2
      const rot = ((pour.rotation ?? 0) * Math.PI) / 180

      // 4 corners in circuit-json space (before rotation), then rotate
      const corners = [
        { x: cx - hw, y: cy - hh },
        { x: cx + hw, y: cy - hh },
        { x: cx + hw, y: cy + hh },
        { x: cx - hw, y: cy + hh },
      ].map(({ x, y }) => {
        const dx = x - cx
        const dy = y - cy
        return {
          x: cx + dx * Math.cos(rot) - dy * Math.sin(rot),
          y: cy + dx * Math.sin(rot) + dy * Math.cos(rot),
        }
      })

      return corners.map((p) => applyToPoint(transform, p))
    }

    if (pour.shape === "polygon") {
      if (!pour.points?.length) return []
      return pour.points.map((p) => applyToPoint(transform, p))
    }

    return []
  }

  override getOutput(): KicadPcb {
    return this.ctx.kicadPcb!
  }
}
