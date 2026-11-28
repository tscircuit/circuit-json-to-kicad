import type { PcbCopperPourBRep, Point } from "circuit-json"
import type { Xy } from "kicadts"
import { tessellateBrepRingVertices } from "./tessellate-brep-ring-vertices"

export function getBrepZoneRings(
  pour: PcbCopperPourBRep,
  convertRingPoints: (points: readonly Point[]) => Xy[],
): [outerRing: Xy[], innerRings: Xy[][]] {
  const outerRing = convertRingPoints(
    tessellateBrepRingVertices(pour.brep_shape.outer_ring.vertices),
  )
  const innerRings = (pour.brep_shape.inner_rings ?? [])
    .map((ring) => convertRingPoints(tessellateBrepRingVertices(ring.vertices)))
    .filter((ringPoints) => ringPoints.length >= 3)

  return [outerRing, innerRings]
}
