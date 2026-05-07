import type {
  CircuitJson,
  PcbCopperPour,
  PcbCopperPourBRep,
  PcbCopperPourPolygon,
  PcbCopperPourRect,
  Ring,
} from "circuit-json"
import type { KicadPcb } from "kicadts"
import { Zone } from "kicadts"
import {
  applyToPoint,
  compose,
  type Matrix,
  rotate,
  translate,
} from "transformation-matrix"
import {
  type ConverterContext,
  ConverterStage,
  type PcbNetInfo,
} from "../../types"
import { getKicadLayer } from "../utils/layerMapping"
import { generateDeterministicUuid } from "./utils/generateDeterministicUuid"

const getCopperPourNetInfo = (
  pour: PcbCopperPour,
  ctx: ConverterContext,
): PcbNetInfo | undefined => {
  let connectivityKey = pour.source_net_id

  if (connectivityKey) {
    const sourceNet = ctx.db.source_net?.get(connectivityKey)
    connectivityKey =
      sourceNet?.subcircuit_connectivity_map_key || sourceNet?.source_net_id
  }

  if (!connectivityKey) return undefined

  return ctx.pcbNetMap?.get(connectivityKey)
}

const getRingPoints = (
  ring: Ring,
  c2kMatPcb: Matrix,
): Array<(string | number)[]> => {
  return (ring.vertices ?? []).map((point) => {
    const transformedPoint = applyToPoint(c2kMatPcb, point)
    return ["xy", transformedPoint.x, transformedPoint.y]
  })
}

const getPolygonPoints = (
  points: Array<{ x: number; y: number }> | undefined,
  c2kMatPcb: Matrix,
): Array<(string | number)[]> => {
  return (points ?? []).map((point) => {
    const transformedPoint = applyToPoint(c2kMatPcb, point)
    return ["xy", transformedPoint.x, transformedPoint.y]
  })
}

const rotatePointsToTopRight = (
  points: Array<(string | number)[]>,
): Array<(string | number)[]> => {
  if (points.length < 2) return points

  let startIndex = 0
  for (let i = 1; i < points.length; i++) {
    const point = points[i]
    const startPoint = points[startIndex]
    if (!point || !startPoint) continue

    const x = point[1] as number
    const y = point[2] as number
    const startX = startPoint[1] as number
    const startY = startPoint[2] as number

    if (x > startX || (x === startX && y > startY)) startIndex = i
  }

  return [...points.slice(startIndex), ...points.slice(0, startIndex)]
}

const getRectRingPoints = (
  pour: PcbCopperPourRect,
  c2kMatPcb: Matrix,
): Array<(string | number)[]> => {
  const ccwRotationDegrees = pour.rotation ?? 0
  const cornerTransform = compose(
    translate(pour.center.x, pour.center.y),
    rotate((ccwRotationDegrees * Math.PI) / 180),
  )
  const halfWidth = pour.width / 2
  const halfHeight = pour.height / 2

  const corners = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ].map((corner) => applyToPoint(cornerTransform, corner))

  return rotatePointsToTopRight(getPolygonPoints(corners, c2kMatPcb))
}

const getCopperPourPolygonPoints = (
  pour: PcbCopperPour,
  c2kMatPcb: Matrix,
): Array<(string | number)[]> => {
  if (pour.shape === "rect") {
    return getRectRingPoints(pour, c2kMatPcb)
  }

  if (pour.shape === "polygon") {
    return rotatePointsToTopRight(
      getPolygonPoints((pour as PcbCopperPourPolygon).points, c2kMatPcb),
    )
  }

  const outerRing = (pour as PcbCopperPourBRep).brep_shape?.outer_ring
  return outerRing
    ? rotatePointsToTopRight(getRingPoints(outerRing, c2kMatPcb))
    : []
}

export class AddCopperPoursStage extends ConverterStage<CircuitJson, KicadPcb> {
  override _step(): void {
    const { kicadPcb, c2kMatPcb } = this.ctx

    if (!kicadPcb) {
      throw new Error("KicadPcb instance not initialized in context")
    }

    if (!c2kMatPcb) {
      throw new Error("PCB transformation matrix not initialized in context")
    }

    const copperPours = (this.ctx.db as any).pcb_copper_pour?.list() as
      | PcbCopperPour[]
      | undefined

    for (const pour of copperPours ?? []) {
      const polygonPoints = getCopperPourPolygonPoints(pour, c2kMatPcb)
      if (polygonPoints.length < 3) continue

      const netInfo = getCopperPourNetInfo(pour, this.ctx)
      const kicadLayer = getKicadLayer(pour.layer)

      const zone = new Zone()
      zone.rawChildren = [
        ["net", netInfo?.id ?? 0],
        ["net_name", netInfo?.name ?? ""],
        ["layer", kicadLayer],
        [
          "uuid",
          generateDeterministicUuid(`zone:${pour.pcb_copper_pour_id ?? ""}`),
        ],
        ["hatch", "edge", 0.5],
        ["connect_pads", "yes", ["clearance", 0.15]],
        ["min_thickness", 0.25],
        ["filled_areas_thickness", "no"],
        ["fill", "yes", ["thermal_gap", 0.5], ["thermal_bridge_width", 0.5]],
        ["polygon", ["pts", ...polygonPoints]],
        ["filled_polygon", ["layer", kicadLayer], ["pts", ...polygonPoints]],
      ]

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
