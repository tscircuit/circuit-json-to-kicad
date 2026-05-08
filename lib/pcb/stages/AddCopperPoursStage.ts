import type {
  CircuitJson,
  PcbCopperPour,
  PcbCopperPourBRep,
  PcbCopperPourPolygon,
  PcbCopperPourRect,
  Ring,
} from "circuit-json"
import type { KicadPcb } from "kicadts"
import {
  Pts,
  Xy,
  Zone,
  ZoneConnectPads,
  ZoneFill,
  ZoneHatch,
  ZonePolygon,
} from "kicadts"
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

const getRingPoints = (ring: Ring, c2kMatPcb: Matrix): Xy[] => {
  return (ring.vertices ?? []).map((point) => {
    const transformedPoint = applyToPoint(c2kMatPcb, point)
    return new Xy(transformedPoint.x, transformedPoint.y)
  })
}

const getPolygonPoints = (
  points: Array<{ x: number; y: number }> | undefined,
  c2kMatPcb: Matrix,
): Xy[] => {
  return (points ?? []).map((point) => {
    const transformedPoint = applyToPoint(c2kMatPcb, point)
    return new Xy(transformedPoint.x, transformedPoint.y)
  })
}

const rotatePointsToTopRight = (points: Xy[]): Xy[] => {
  if (points.length < 2) return points

  let startIndex = 0
  for (let i = 1; i < points.length; i++) {
    const point = points[i]
    const startPoint = points[startIndex]
    if (!point || !startPoint) continue

    if (
      point.x > startPoint.x ||
      (point.x === startPoint.x && point.y > startPoint.y)
    ) {
      startIndex = i
    }
  }

  return [...points.slice(startIndex), ...points.slice(0, startIndex)]
}

const getRectRingPoints = (
  pour: PcbCopperPourRect,
  c2kMatPcb: Matrix,
): Xy[] => {
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
): Xy[] => {
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

      const polygonPts = new Pts(polygonPoints)
      const zone = new Zone({
        net: netInfo?.id ?? 0,
        netName: netInfo?.name ?? "",
        layer: kicadLayer,
        uuid: generateDeterministicUuid(
          `zone:${pour.pcb_copper_pour_id ?? ""}`,
        ),
        hatch: new ZoneHatch("edge", 0.5),
        connectPads: new ZoneConnectPads({ enabled: true, clearance: 0.15 }),
        minThickness: 0.25,
        filledAreasThickness: false,
        fill: new ZoneFill({
          filled: true,
          thermalGap: 0.5,
          thermalBridgeWidth: 0.5,
        }),
        polygons: [new ZonePolygon(polygonPts)],
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
