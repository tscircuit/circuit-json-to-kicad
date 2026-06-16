import type { SchematicArc } from "circuit-json"

type Point = {
  x: number
  y: number
}

type Bounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const CARDINAL_ANGLES_DEGREES = [0, 90, 180, 270] as const

const normalizeDegrees = (degrees: number): number =>
  ((degrees % 360) + 360) % 360

export const getSchematicArcSignedSweepDegrees = (
  arc: Pick<
    SchematicArc,
    "start_angle_degrees" | "end_angle_degrees" | "direction"
  >,
): number => {
  const start = normalizeDegrees(arc.start_angle_degrees)
  const end = normalizeDegrees(arc.end_angle_degrees)

  if (arc.direction === "clockwise") {
    const clockwiseSweep = (start - end + 360) % 360
    return clockwiseSweep === 0 ? -360 : -clockwiseSweep
  }

  const counterclockwiseSweep = (end - start + 360) % 360
  return counterclockwiseSweep === 0 ? 360 : counterclockwiseSweep
}

export const getSchematicArcPointAtDegrees = (
  center: Point,
  radius: number,
  angleDegrees: number,
): Point => {
  const angleRadians = (angleDegrees * Math.PI) / 180
  return {
    x: center.x + radius * Math.cos(angleRadians),
    y: center.y + radius * Math.sin(angleRadians),
  }
}

export const getSchematicArcStartMidEndPoints = (
  arc: Pick<
    SchematicArc,
    | "center"
    | "radius"
    | "start_angle_degrees"
    | "end_angle_degrees"
    | "direction"
  >,
): {
  start: Point
  mid: Point
  end: Point
} => {
  const signedSweepDegrees = getSchematicArcSignedSweepDegrees(arc)
  const midAngleDegrees = arc.start_angle_degrees + signedSweepDegrees / 2

  return {
    start: getSchematicArcPointAtDegrees(
      arc.center,
      arc.radius,
      arc.start_angle_degrees,
    ),
    mid: getSchematicArcPointAtDegrees(arc.center, arc.radius, midAngleDegrees),
    end: getSchematicArcPointAtDegrees(
      arc.center,
      arc.radius,
      arc.start_angle_degrees + signedSweepDegrees,
    ),
  }
}

const isAngleOnArcSweep = (
  angleDegrees: number,
  arc: Pick<
    SchematicArc,
    "start_angle_degrees" | "end_angle_degrees" | "direction"
  >,
): boolean => {
  const target = normalizeDegrees(angleDegrees)
  const start = normalizeDegrees(arc.start_angle_degrees)
  const sweepMagnitude = Math.abs(getSchematicArcSignedSweepDegrees(arc))

  if (sweepMagnitude >= 360) {
    return true
  }

  if (arc.direction === "clockwise") {
    const delta = (start - target + 360) % 360
    return delta <= sweepMagnitude
  }

  const delta = (target - start + 360) % 360
  return delta <= sweepMagnitude
}

export const getSchematicArcBounds = (
  arc: Pick<
    SchematicArc,
    | "center"
    | "radius"
    | "start_angle_degrees"
    | "end_angle_degrees"
    | "direction"
  >,
): Bounds => {
  const { start, end } = getSchematicArcStartMidEndPoints(arc)
  const points: Point[] = [start, end]

  for (const angleDegrees of CARDINAL_ANGLES_DEGREES) {
    if (isAngleOnArcSweep(angleDegrees, arc)) {
      points.push(
        getSchematicArcPointAtDegrees(arc.center, arc.radius, angleDegrees),
      )
    }
  }

  return points.reduce<Bounds>(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    },
  )
}
