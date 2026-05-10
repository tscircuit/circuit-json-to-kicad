import type { CircuitJson } from "circuit-json"
import type { Matrix } from "transformation-matrix"
import type { KicadPcb } from "kicadts"
import { Zone } from "kicadts"
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
    this.pours = (this.ctx.db.pcb_copper_pour?.list() ?? []) as CopperPourLike[]
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
      let netInfo = pcbNetMap.get(pour.source_net_id)
      if (!netInfo) {
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

    const seed = `copper_pour:${pour.pcb_copper_pour_id}:${kicadLayer}`
    const zone = new Zone()
    zone.rawChildren = [
      ["net", netId],
      ["net_name", netName],
      ["layer", kicadLayer],
      ["hatch", "edge", 0.508],
      ["fill", "yes"],
      ["uuid", generateDeterministicUuid(seed)],
      [
        "polygon",
        [
          "pts",
          ...kicadPoints.map((p): [string, number, number] => ["xy", p.x, p.y]),
        ],
      ],
    ]

    const zones = kicadPcb.zones ?? []
    zones.push(zone)
    kicadPcb.zones = zones
  }

  private getKicadPoints(
    pour: CopperPourLike,
    transform: Matrix,
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
