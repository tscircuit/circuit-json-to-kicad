import type { SchematicArc } from "circuit-json"
import {
  Stroke,
  SymbolArc,
  SymbolArcEnd,
  SymbolArcFill,
  SymbolArcMid,
  SymbolArcStart,
} from "kicadts"
import { applyToPoint, type Matrix } from "transformation-matrix"

function getKicadSymbolArcPoint({
  arc,
  ccwAngleDegrees,
  circuitJsonToKicadSymbolTransform,
}: {
  arc: SchematicArc
  ccwAngleDegrees: number
  circuitJsonToKicadSymbolTransform: Matrix
}): { x: number; y: number } {
  const ccwAngleRadians = (ccwAngleDegrees * Math.PI) / 180
  return applyToPoint(circuitJsonToKicadSymbolTransform, {
    x: arc.center.x + arc.radius * Math.cos(ccwAngleRadians),
    y: arc.center.y + arc.radius * Math.sin(ccwAngleRadians),
  })
}

export function createArcFromPrimitive({
  arc,
  circuitJsonToKicadSymbolTransform,
}: {
  arc: SchematicArc
  circuitJsonToKicadSymbolTransform: Matrix
}): SymbolArc {
  const counterclockwiseSweepDegrees =
    (((arc.end_angle_degrees - arc.start_angle_degrees) % 360) + 360) % 360
  let sweepDegrees = counterclockwiseSweepDegrees
  if (arc.direction === "clockwise") {
    sweepDegrees -= 360
  }
  const midAngleDegrees = arc.start_angle_degrees + sweepDegrees / 2

  const start = getKicadSymbolArcPoint({
    arc,
    ccwAngleDegrees: arc.start_angle_degrees,
    circuitJsonToKicadSymbolTransform,
  })
  const mid = getKicadSymbolArcPoint({
    arc,
    ccwAngleDegrees: midAngleDegrees,
    circuitJsonToKicadSymbolTransform,
  })
  const end = getKicadSymbolArcPoint({
    arc,
    ccwAngleDegrees: arc.end_angle_degrees,
    circuitJsonToKicadSymbolTransform,
  })

  const stroke = new Stroke()
  stroke.width = 0.254
  stroke.type = "default"

  const fill = new SymbolArcFill()
  fill.type = "none"

  const symbolArc = new SymbolArc()
  Object.assign(symbolArc, {
    _sxStart: new SymbolArcStart(start.x, start.y),
    _sxMid: new SymbolArcMid(mid.x, mid.y),
    _sxEnd: new SymbolArcEnd(end.x, end.y),
    _sxStroke: stroke,
    _sxFill: fill,
  })

  return symbolArc
}
