import type { CircuitJson, PcbComponent } from "circuit-json"
import type { KicadPcb } from "kicadts"
import { Pts, Xy, Zone, ZoneKeepout, ZonePolygon } from "kicadts"
import { applyToPoint } from "transformation-matrix"
import { ConverterStage } from "../../types"
import { getKicadLayer } from "../utils/layerMapping"
import { circleToPolygon } from "./utils/circleToPolygon"
import { generateDeterministicUuid } from "./utils/generateDeterministicUuid"

function parseDimension(
  val: number | string | undefined,
  defaultVal = 0,
): number {
  if (typeof val === "number") return val
  if (typeof val === "string") {
    const trimmed = val.trim().toLowerCase()
    if (trimmed.endsWith("mm")) {
      return parseFloat(trimmed.slice(0, -2))
    }
    if (trimmed.endsWith("um")) {
      return parseFloat(trimmed.slice(0, -2)) / 1000
    }
    if (trimmed.endsWith("in") || trimmed.endsWith("inch")) {
      return parseFloat(trimmed) * 25.4
    }
    const parsed = parseFloat(trimmed)
    return Number.isNaN(parsed) ? defaultVal : parsed
  }
  return defaultVal
}

function rotatePoint(
  point: { x: number; y: number },
  angleDegrees: number,
): { x: number; y: number } {
  const rad = (angleDegrees * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  }
}

function getRotatedRectPoints({
  x,
  y,
  width,
  height,
  ccwRotation,
}: {
  x: number
  y: number
  width: number
  height: number
  ccwRotation: number
}): Array<{ x: number; y: number }> {
  const halfW = width / 2
  const halfH = height / 2
  return [
    { x: -halfW, y: -halfH },
    { x: halfW, y: -halfH },
    { x: halfW, y: halfH },
    { x: -halfW, y: halfH },
  ].map((p) => {
    const r = rotatePoint(p, ccwRotation)
    return { x: x + r.x, y: y + r.y }
  })
}

interface AreaElement {
  type: string
  name?: string
  pcb_keepout_id?: string
  pcb_rule_area_id?: string
  source_rule_area_id?: string
  rule_area_id?: string
  shape?: "rect" | "circle" | "polygon" | "outline"
  center?: { x: number; y: number }
  width?: number | string
  height?: number | string
  radius?: number | string
  points?: Array<{ x: number; y: number }>
  outline?: Array<{ x: number; y: number }>
  layers?: string[]
  pcb_component_id?: string
  source_component_id?: string
  is_world_coordinates?: boolean
  rules?: any[]
  allow_traces?: boolean
  allow_vias?: boolean
  allow_pads?: boolean
  allow_copper_pour?: boolean
  allow_placements?: boolean
}

export class AddKeepoutsStage extends ConverterStage<CircuitJson, KicadPcb> {
  override _step(): void {
    const { kicadPcb, c2kMatPcb } = this.ctx

    if (!kicadPcb)
      throw new Error("KicadPcb instance not initialized in context")
    if (!c2kMatPcb)
      throw new Error("PCB transformation matrix not initialized in context")

    const areaElements: AreaElement[] = []
    for (const el of this.input) {
      if (
        el.type === "pcb_keepout" ||
        (el as any).type === "pcb_rule_area" ||
        (el as any).type === "source_rule_area"
      ) {
        areaElements.push(el as any)
      }
    }

    for (let idx = 0; idx < areaElements.length; idx++) {
      const area = areaElements[idx]!
      const areaId =
        area.pcb_rule_area_id ??
        area.pcb_keepout_id ??
        area.source_rule_area_id ??
        area.rule_area_id ??
        `area_${idx + 1}`
      const areaName = area.name ?? areaId

      // Find owning component if component-owned
      const ownerPcbComp = area.pcb_component_id
        ? (this.input.find(
            (e) =>
              e.type === "pcb_component" &&
              e.pcb_component_id === area.pcb_component_id,
          ) as PcbComponent | undefined)
        : area.source_component_id
          ? (this.input.find(
              (e) =>
                e.type === "pcb_component" &&
                e.source_component_id === area.source_component_id,
            ) as PcbComponent | undefined)
          : undefined

      const isWorld = area.is_world_coordinates === true || !ownerPcbComp
      const compCenter = ownerPcbComp?.center ?? { x: 0, y: 0 }
      const compRot =
        ownerPcbComp?.rotation ?? (ownerPcbComp as any)?.ccw_rotation ?? 0
      const compLayer = ownerPcbComp?.layer ?? "top"
      const isBottom = compLayer === "bottom"

      const rawLayers =
        area.layers && area.layers.length > 0
          ? area.layers
          : ownerPcbComp
            ? [compLayer]
            : ["top", "bottom"]

      const kicadLayers = rawLayers.map(getKicadLayer)

      // Transform geometry into world mm coordinates
      const localCenter = area.center ?? { x: 0, y: 0 }
      let worldCenter: { x: number; y: number }

      if (isWorld) {
        worldCenter = localCenter
      } else {
        let px = localCenter.x
        const py = localCenter.y
        if (isBottom) px = -px
        const rotated = rotatePoint({ x: px, y: py }, compRot)
        worldCenter = {
          x: compCenter.x + rotated.x,
          y: compCenter.y + rotated.y,
        }
      }

      const shape = area.shape ?? (area.radius ? "circle" : "rect")
      let rawPoints: Array<{ x: number; y: number }>

      if (shape === "circle") {
        const radius = parseDimension(area.radius, 1)
        rawPoints = circleToPolygon(worldCenter, radius).map(([x, y]) => ({
          x,
          y,
        }))
      } else if (shape === "polygon" || shape === "outline") {
        const pts = area.points ?? area.outline ?? []
        if (isWorld) {
          rawPoints = pts
        } else {
          rawPoints = pts.map((p) => {
            let px = p.x
            const py = p.y
            if (isBottom) px = -px
            const rotated = rotatePoint({ x: px, y: py }, compRot)
            return {
              x: compCenter.x + rotated.x,
              y: compCenter.y + rotated.y,
            }
          })
        }
      } else {
        // "rect"
        const width = parseDimension(area.width, 2)
        const height = parseDimension(area.height, 2)
        let totalRot = 0
        if (!isWorld) {
          totalRot = isBottom ? (360 - compRot) % 360 : compRot
        }
        rawPoints = getRotatedRectPoints({
          x: worldCenter.x,
          y: worldCenter.y,
          width,
          height,
          ccwRotation: totalRot,
        })
      }

      const kicadPoints = rawPoints.map((p) => {
        const t = applyToPoint(c2kMatPcb, p)
        return new Xy(t.x, t.y)
      })

      // Determine basic keepout permissions:
      // When independent rules exist with conditional selectors or warnings,
      // allow those targets on the zone keepout so scoped .kicad_dru rules govern them.
      let tracks: "allowed" | "not_allowed" = "not_allowed"
      let vias: "allowed" | "not_allowed" = "not_allowed"
      let pads: "allowed" | "not_allowed" = "not_allowed"
      let copperpour: "allowed" | "not_allowed" = "not_allowed"
      let footprints: "allowed" | "not_allowed" = "not_allowed"

      if (area.rules && Array.isArray(area.rules) && area.rules.length > 0) {
        const hasUnconditionalError = (targets: string[]) =>
          area.rules!.some((r: any) => {
            const matchesTarget = r.targets?.some((t: string) =>
              targets.includes(t),
            )
            if (!matchesTarget) return false
            const hasExemption =
              r.excludeOwner ||
              (r.excludeComponentClasses &&
                r.excludeComponentClasses.length > 0) ||
              (r.excludeRefs && r.excludeRefs.length > 0) ||
              (r.exceptNets && r.exceptNets.length > 0) ||
              (r.exceptNetClasses && r.exceptNetClasses.length > 0)
            const isWarning = r.severity === "warning"
            const hasClearance =
              r.constraint?.clearance &&
              parseDimension(r.constraint.clearance) > 0
            return !hasExemption && !isWarning && !hasClearance
          })

        tracks = hasUnconditionalError(["track", "trace"])
          ? "not_allowed"
          : "allowed"
        vias = hasUnconditionalError(["via"]) ? "not_allowed" : "allowed"
        pads = hasUnconditionalError(["pad"]) ? "not_allowed" : "allowed"
        copperpour = hasUnconditionalError(["zone", "copper_pour"])
          ? "not_allowed"
          : "allowed"
        footprints = hasUnconditionalError(["component", "footprint"])
          ? "not_allowed"
          : "allowed"
      } else {
        // Traditional keepout without independent rules
        tracks = area.allow_traces ? "allowed" : "not_allowed"
        vias = area.allow_vias ? "allowed" : "not_allowed"
        pads = area.allow_pads ? "allowed" : "not_allowed"
        copperpour = area.allow_copper_pour ? "allowed" : "not_allowed"
        footprints = area.allow_placements ? "allowed" : "not_allowed"
      }

      const zone = new Zone({
        net: 0,
        netName: "",
        name: areaName,
        layers: kicadLayers,
        uuid: generateDeterministicUuid(`keepout:${areaId}`),
        keepout: new ZoneKeepout({
          tracks,
          vias,
          pads,
          copperpour,
          footprints,
        }),
        polygons: [new ZonePolygon(new Pts(kicadPoints))],
      })

      const zones = kicadPcb.zones
      zones.push(zone)
      kicadPcb.zones = zones
    }

    this.finished = true
  }

  override getOutput(): KicadPcb {
    return this.ctx.kicadPcb!
  }
}
