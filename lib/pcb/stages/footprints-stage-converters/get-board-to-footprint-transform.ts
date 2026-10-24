import type { Point } from "circuit-json"
import { compose, rotateDEG, scale, translate } from "transformation-matrix"

export interface FootprintGraphicsPlacement {
  footprintOrigin: Point
  ccwRotationDegrees?: number
}

/**
 * Map points from right-handed board-world mm (+X right, +Y up) into KiCad
 * footprint-local mm (+X right, +Y down). Undo placement around the authored
 * origin and invert the Y coordinate. This is the same composition used by
 * convertSilkscreenRects and convertCourtyardRects; KiCad applies the opposite
 * footprint angle when placing these local points back on its board.
 */
export function getBoardToFootprintTransform({
  footprintOrigin,
  ccwRotationDegrees = 0,
}: FootprintGraphicsPlacement) {
  return compose(
    rotateDEG(ccwRotationDegrees),
    scale(1, -1),
    translate(-footprintOrigin.x, -footprintOrigin.y),
  )
}
