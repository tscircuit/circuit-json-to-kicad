import type {
  CircuitJson,
  PcbCopperPour,
  PcbCopperPourBRep,
  PcbCopperPourPolygon,
  PcbCopperPourRect,
} from "circuit-json"
import type { KicadPcb } from "kicadts"
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
import { triangulatePolygonWithHoles } from "./utils/custom-pad-geometry"
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
  const directNetInfo = ctx.pcbNetMap?.get(pour.pcb_copper_pour_id)
  if (directNetInfo) return directNetInfo

  let connectivityKey = pour.source_net_id

  if (connectivityKey) {
    const sourceNet = ctx.db.source_net?.get(connectivityKey)
    connectivityKey =
      sourceNet?.subcircuit_connectivity_map_key ||
      sourceNet?.source_net_id ||
      connectivityKey
  }

  if (!connectivityKey) return undefined

  return ctx.pcbNetMap?.get(connectivityKey)
}

const BULGE_EPSILON = 1e-9

const tessellateBrepRingVertices = (
  vertices: readonly { x: number; y: number; bulge?: number }[] | undefined,
): { x: number; y: number }[] => {
  if (!vertices || vertices.length === 0) return []

  const points: { x: number; y: number }[] = []

  for (let i = 0; i < vertices.length; i++) {
    const start = vertices[i]
    const end = vertices[(i + 1) % vertices.length]
    if (!start || !end) continue

    points.push({ x: start.x, y: start.y })

    const bulge = start.bulge
    if (!bulge || Math.abs(bulge) < BULGE_EPSILON) continue

    const chordX = end.x - start.x
    const chordY = end.y - start.y
    const chordLength = Math.hypot(chordX, chordY)
    if (chordLength < BULGE_EPSILON) continue

    const sweepAngle = 4 * Math.atan(bulge)
    const centerOffset = (chordLength * (1 - bulge * bulge)) / (4 * bulge)
    const center = {
      x: (start.x + end.x) / 2 - (chordY / chordLength) * centerOffset,
      y: (start.y + end.y) / 2 + (chordX / chordLength) * centerOffset,
    }
    const radius = Math.hypot(start.x - center.x, start.y - center.y)
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x)
    const segmentCount = Math.max(
      4,
      Math.ceil((Math.abs(sweepAngle) / (Math.PI * 2)) * 32),
    )

    for (let step = 1; step < segmentCount; step++) {
      const angle = startAngle + (sweepAngle * step) / segmentCount
      points.push({
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle),
      })
    }
  }

  return points
}

const convertPointsToKicadXy = (
  points: readonly { x: number; y: number }[] | undefined,
  c2kMatPcb: Matrix,
): Xy[] => {
  return (points ?? []).map((point) => {
    const transformedPoint = applyToPoint(c2kMatPcb, point)
    return new Xy(transformedPoint.x, transformedPoint.y)
  })
}

const rotateRingToStartAtTopRight = (points: Xy[]): Xy[] => {
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

const removeConsecutiveDuplicatePoints = (points: Xy[]): Xy[] => {
  const dedupedPoints: Xy[] = []

  for (const point of points) {
    const lastPoint = dedupedPoints[dedupedPoints.length - 1]
    if (lastPoint?.x === point.x && lastPoint.y === point.y) {
      continue
    }
    dedupedPoints.push(point)
  }

  return dedupedPoints
}

const removeRepeatedClosingPoint = (points: Xy[]): Xy[] => {
  const dedupedPoints = [...points]

  const firstPoint = dedupedPoints[0]
  const lastPoint = dedupedPoints[dedupedPoints.length - 1]
  if (
    firstPoint &&
    lastPoint &&
    dedupedPoints.length > 1 &&
    firstPoint.x === lastPoint.x &&
    firstPoint.y === lastPoint.y
  ) {
    dedupedPoints.pop()
  }

  return dedupedPoints
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

  return convertPointsToKicadXy(corners, c2kMatPcb)
}

const getPolygonRingPoints = (
  pour: PcbCopperPourPolygon,
  c2kMatPcb: Matrix,
): Xy[] =>
  removeRepeatedClosingPoint(
    removeConsecutiveDuplicatePoints(
      rotateRingToStartAtTopRight(
        convertPointsToKicadXy(pour.points, c2kMatPcb),
      ),
    ),
  )

const getBrepZoneRings = (
  pour: PcbCopperPourBRep,
  c2kMatPcb: Matrix,
): [outerRing: Xy[], innerRings: Xy[][]] => [
  removeRepeatedClosingPoint(
    removeConsecutiveDuplicatePoints(
      rotateRingToStartAtTopRight(
        convertPointsToKicadXy(
          tessellateBrepRingVertices(pour.brep_shape.outer_ring.vertices),
          c2kMatPcb,
        ),
      ),
    ),
  ),
  (pour.brep_shape.inner_rings ?? [])
    .map((ring) =>
      removeRepeatedClosingPoint(
        removeConsecutiveDuplicatePoints(
          rotateRingToStartAtTopRight(
            convertPointsToKicadXy(
              tessellateBrepRingVertices(ring.vertices),
              c2kMatPcb,
            ),
          ),
        ),
      ),
    )
    .filter((ringPoints) => ringPoints.length >= 3),
]

const getCopperPourZoneRings = (
  pour: PcbCopperPour,
  c2kMatPcb: Matrix,
): [outerRing: Xy[], innerRings: Xy[][]] => {
  switch (pour.shape) {
    case "rect":
      return [
        removeRepeatedClosingPoint(
          removeConsecutiveDuplicatePoints(
            rotateRingToStartAtTopRight(getRectRingPoints(pour, c2kMatPcb)),
          ),
        ),
        [],
      ]

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

  return triangulatePolygonWithHoles(outerRing, innerRings).map(
    (triangle) =>
      new ZoneFilledPolygon({
        layer,
        pts: new Pts(triangle.map((point) => new Xy(point.x, point.y))),
      }),
  )
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
