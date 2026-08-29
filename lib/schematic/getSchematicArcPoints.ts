import type { SchematicArc } from "circuit-json"

type ArcDefinition = Pick<
  SchematicArc,
  | "center"
  | "radius"
  | "start_angle_degrees"
  | "end_angle_degrees"
  | "direction"
>

const normalizePositiveDegrees = (degrees: number): number =>
  ((degrees % 360) + 360) % 360

const getDirectedSweepDegrees = ({
  startAngleDegrees,
  endAngleDegrees,
  direction,
}: {
  startAngleDegrees: number
  endAngleDegrees: number
  direction: SchematicArc["direction"]
}): number => {
  if (direction === "clockwise") {
    const sweep = normalizePositiveDegrees(startAngleDegrees - endAngleDegrees)
    return sweep === 0 && startAngleDegrees !== endAngleDegrees ? -360 : -sweep
  }

  const sweep = normalizePositiveDegrees(endAngleDegrees - startAngleDegrees)
  return sweep === 0 && startAngleDegrees !== endAngleDegrees ? 360 : sweep
}

const getPointAtAngle = (
  arc: Pick<ArcDefinition, "center" | "radius">,
  angleDegrees: number,
) => {
  const angleRadians = (angleDegrees * Math.PI) / 180
  return {
    x: arc.center.x + arc.radius * Math.cos(angleRadians),
    y: arc.center.y + arc.radius * Math.sin(angleRadians),
  }
}

/**
 * Convert Circuit JSON's center/radius/angle arc representation into the
 * three points used by KiCad. The midpoint follows the requested direction,
 * so major arcs and clockwise arcs retain their original sweep.
 */
export const getSchematicArcPoints = (arc: ArcDefinition) => {
  const sweepDegrees = getDirectedSweepDegrees({
    startAngleDegrees: arc.start_angle_degrees,
    endAngleDegrees: arc.end_angle_degrees,
    direction: arc.direction,
  })
  const midAngleDegrees = arc.start_angle_degrees + sweepDegrees / 2

  return {
    start: getPointAtAngle(arc, arc.start_angle_degrees),
    mid: getPointAtAngle(arc, midAngleDegrees),
    end: getPointAtAngle(arc, arc.start_angle_degrees + sweepDegrees),
  }
}
