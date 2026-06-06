import type {
  CircuitJson,
  PCBKeepout,
  PCBKeepoutCircle,
  PCBKeepoutRect,
} from "circuit-json"
import type { KicadPcb } from "kicadts"
import {
  Pts,
  Xy,
  Zone,
  ZoneConnectPads,
  ZoneHatch,
  ZoneKeepout,
  ZonePolygon,
} from "kicadts"
import { applyToPoint, type Matrix } from "transformation-matrix"
import { ConverterStage, type ConverterContext } from "../../types"
import { getKicadLayer } from "../utils/layerMapping"
import { generateDeterministicUuid } from "./utils/generateDeterministicUuid"

const CIRCLE_SEGMENTS = 64

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

const transformPoints = (
  points: Array<{ x: number; y: number }>,
  c2kMatPcb: Matrix,
): Xy[] =>
  points.map((point) => {
    const transformedPoint = applyToPoint(c2kMatPcb, point)
    return new Xy(transformedPoint.x, transformedPoint.y)
  })

const getRectPoints = (keepout: PCBKeepoutRect, c2kMatPcb: Matrix): Xy[] => {
  const { center, width, height } = keepout
  const halfWidth = width / 2
  const halfHeight = height / 2

  return rotatePointsToTopRight(
    transformPoints(
      [
        { x: center.x - halfWidth, y: center.y - halfHeight },
        { x: center.x + halfWidth, y: center.y - halfHeight },
        { x: center.x + halfWidth, y: center.y + halfHeight },
        { x: center.x - halfWidth, y: center.y + halfHeight },
      ],
      c2kMatPcb,
    ),
  )
}

const getCirclePoints = (
  keepout: PCBKeepoutCircle,
  c2kMatPcb: Matrix,
): Xy[] => {
  const points = Array.from({ length: CIRCLE_SEGMENTS }, (_, index) => {
    const theta = (index / CIRCLE_SEGMENTS) * Math.PI * 2
    return {
      x: keepout.center.x + Math.cos(theta) * keepout.radius,
      y: keepout.center.y + Math.sin(theta) * keepout.radius,
    }
  })

  return rotatePointsToTopRight(transformPoints(points, c2kMatPcb))
}

const getKeepoutPolygonPoints = (
  keepout: PCBKeepout,
  c2kMatPcb: Matrix,
): Xy[] => {
  if (keepout.shape === "rect") {
    return getRectPoints(keepout, c2kMatPcb)
  }

  return getCirclePoints(keepout, c2kMatPcb)
}

const getKeepoutLayers = (keepout: PCBKeepout): string[] =>
  keepout.layers.length > 0 ? keepout.layers.map(getKicadLayer) : ["F.Cu"]

const createZoneKeepout = (): ZoneKeepout => {
  return new ZoneKeepout({
    tracks: "not_allowed",
    vias: "not_allowed",
    pads: "not_allowed",
    copperpour: "not_allowed",
    footprints: "not_allowed",
  })
}

export class AddKeepoutsStage extends ConverterStage<CircuitJson, KicadPcb> {
  override _step(): void {
    const { kicadPcb, c2kMatPcb } = this.ctx

    if (!kicadPcb) {
      throw new Error("KicadPcb instance not initialized in context")
    }

    if (!c2kMatPcb) {
      throw new Error("PCB transformation matrix not initialized in context")
    }

    const keepouts = (this.ctx.db as any).pcb_keepout?.list() as
      | PCBKeepout[]
      | undefined

    for (const keepout of keepouts ?? []) {
      const polygonPoints = getKeepoutPolygonPoints(keepout, c2kMatPcb)
      if (polygonPoints.length < 3) continue

      const kicadLayers = getKeepoutLayers(keepout)
      const zone = new Zone({
        net: 0,
        netName: "",
        layer: kicadLayers.length === 1 ? kicadLayers[0] : undefined,
        layers: kicadLayers.length > 1 ? kicadLayers : undefined,
        uuid: generateDeterministicUuid(
          `keepout:${keepout.pcb_keepout_id ?? ""}`,
        ),
        name: keepout.description,
        hatch: new ZoneHatch("edge", 0.5),
        connectPads: new ZoneConnectPads({ enabled: true, clearance: 0.15 }),
        minThickness: 0.25,
        keepout: createZoneKeepout(),
        fill: undefined,
        polygons: [new ZonePolygon(new Pts(polygonPoints))],
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
