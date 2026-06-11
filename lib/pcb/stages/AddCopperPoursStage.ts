import type {
  CircuitJson,
  PcbCopperPour,
  PcbCopperPourBRep,
  PcbCopperPourPolygon,
  PcbCopperPourRect,
} from "circuit-json"
import type { KicadPcb } from "kicadts"
import earcut from "earcut"
import {
  Layer,
  Pts,
  Xy,
  Zone,
  ZoneConnectPads,
  ZoneFill,
  ZoneFilledPolygon,
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

const isPcbCopperPour = (
  element: CircuitJson[number],
): element is PcbCopperPour => element.type === "pcb_copper_pour"

const getCopperPours = (circuitJson: CircuitJson): PcbCopperPour[] =>
  circuitJson.filter(isPcbCopperPour)

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

const transformPoints = (
  points: readonly { x: number; y: number }[] | undefined,
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

const sanitizeRingPoints = (points: Xy[]): Xy[] => {
  const sanitized: Xy[] = []

  for (const point of points) {
    const lastPoint = sanitized[sanitized.length - 1]
    if (lastPoint?.x === point.x && lastPoint.y === point.y) {
      continue
    }
    sanitized.push(point)
  }

  const firstPoint = sanitized[0]
  const lastPoint = sanitized[sanitized.length - 1]
  if (
    firstPoint &&
    lastPoint &&
    sanitized.length > 1 &&
    firstPoint.x === lastPoint.x &&
    firstPoint.y === lastPoint.y
  ) {
    sanitized.pop()
  }

  return sanitized
}

const normalizeRing = (points: Xy[]): Xy[] => {
  return sanitizeRingPoints(rotatePointsToTopRight(points))
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

  return transformPoints(corners, c2kMatPcb)
}

const getPolygonRingPoints = (
  pour: PcbCopperPourPolygon,
  c2kMatPcb: Matrix,
): Xy[] => normalizeRing(transformPoints(pour.points, c2kMatPcb))

const getBrepZoneRings = (
  pour: PcbCopperPourBRep,
  c2kMatPcb: Matrix,
): [outerRing: Xy[], innerRings: Xy[][]] => [
  normalizeRing(
    transformPoints(pour.brep_shape.outer_ring.vertices, c2kMatPcb),
  ),
  pour.brep_shape.inner_rings
    .map((ring) => normalizeRing(transformPoints(ring.vertices, c2kMatPcb)))
    .filter((ringPoints) => ringPoints.length >= 3),
]

const getCopperPourZoneRings = (
  pour: PcbCopperPour,
  c2kMatPcb: Matrix,
): [outerRing: Xy[], innerRings: Xy[][]] => {
  switch (pour.shape) {
    case "rect":
      return [normalizeRing(getRectRingPoints(pour, c2kMatPcb)), []]

    case "polygon":
      return [getPolygonRingPoints(pour, c2kMatPcb), []]

    case "brep":
      return getBrepZoneRings(pour, c2kMatPcb)
  }
}

const createZonePolygons = (
  outerRing: Xy[],
  innerRings: Xy[][],
): ZonePolygon[] => {
  const polygons: ZonePolygon[] = []

  if (outerRing.length >= 3) {
    polygons.push(new ZonePolygon(new Pts(outerRing)))
  }

  for (const innerRing of innerRings) {
    if (innerRing.length < 3) continue
    polygons.push(new ZonePolygon(new Pts(innerRing)))
  }

  return polygons
}

const getTriangleArea = (a: Xy, b: Xy, c: Xy): number =>
  Math.abs((a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)) / 2)

const createZoneFilledPolygons = (
  outerRing: Xy[],
  innerRings: Xy[][],
  kicadLayer: string,
): ZoneFilledPolygon[] => {
  if (outerRing.length < 3) {
    return []
  }

  const layer = new Layer([kicadLayer])

  if (innerRings.length === 0) {
    return [
      new ZoneFilledPolygon({
        layer,
        pts: new Pts(outerRing),
      }),
    ]
  }

  const flattenedPoints: number[] = []
  const holeIndices: number[] = []
  let pointIndex = 0

  const addRing = (ring: Xy[]) => {
    for (const point of ring) {
      flattenedPoints.push(point.x, point.y)
    }
    pointIndex += ring.length
  }

  addRing(outerRing)

  for (const innerRing of innerRings) {
    holeIndices.push(pointIndex)
    addRing(innerRing)
  }

  const triangleIndices = earcut(flattenedPoints, holeIndices, 2)
  const filledPolygons: ZoneFilledPolygon[] = []

  for (let i = 0; i < triangleIndices.length; i += 3) {
    const trianglePoints: Xy[] = []

    for (let offset = 0; offset < 3; offset++) {
      const pointOffset = triangleIndices[i + offset]! * 2
      const x = flattenedPoints[pointOffset]
      const y = flattenedPoints[pointOffset + 1]
      if (x === undefined || y === undefined) continue
      trianglePoints.push(new Xy(x, y))
    }

    if (
      trianglePoints.length !== 3 ||
      getTriangleArea(
        trianglePoints[0]!,
        trianglePoints[1]!,
        trianglePoints[2]!,
      ) === 0
    ) {
      continue
    }

    filledPolygons.push(
      new ZoneFilledPolygon({
        layer,
        pts: new Pts(trianglePoints),
      }),
    )
  }

  return filledPolygons
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

    const copperPours = getCopperPours(this.input)

    for (const pour of copperPours) {
      const [outerRing, innerRings] = getCopperPourZoneRings(pour, c2kMatPcb)
      if (outerRing.length < 3) continue

      const netInfo = getCopperPourNetInfo(pour, this.ctx)
      const kicadLayer = getKicadLayer(pour.layer)

      const zone = new Zone({
        net: netInfo?.id ?? 0,
        netName: netInfo?.name ?? "",
        layer: kicadLayer,
        uuid: generateDeterministicUuid(`zone:${pour.pcb_copper_pour_id}`),
        hatch: new ZoneHatch("edge", 0.5),
        connectPads: new ZoneConnectPads({ enabled: true, clearance: 0.15 }),
        minThickness: 0.25,
        filledAreasThickness: false,
        fill: new ZoneFill({
          filled: true,
          thermalGap: 0.5,
          thermalBridgeWidth: 0.5,
          islandRemovalMode: 0,
        }),
        polygons: createZonePolygons(outerRing, innerRings),
        filledPolygons: createZoneFilledPolygons(
          outerRing,
          innerRings,
          kicadLayer,
        ),
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
