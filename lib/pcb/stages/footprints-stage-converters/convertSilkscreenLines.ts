import type { PcbSilkscreenLine } from "circuit-json"
import { convertSilkscreenPaths } from "./convertSilkscreenPaths"

/**
 * Convert board-space line endpoints (mm, +X right, +Y up) to footprint-local
 * points (mm, +X right, +Y down before the footprint's placement rotation).
 * Reuse the path converter's inverse placement transform for two-point paths.
 */
export function convertSilkscreenLines({
  silkscreenLines,
  componentCenter,
  componentRotation,
}: {
  silkscreenLines: PcbSilkscreenLine[]
  componentCenter: { x: number; y: number }
  componentRotation: number
}) {
  return convertSilkscreenPaths(
    silkscreenLines.map((line) => ({
      layer: line.layer,
      stroke_width: line.stroke_width,
      route: [
        { x: line.x1, y: line.y1 },
        { x: line.x2, y: line.y2 },
      ],
    })),
    { componentCenter, componentRotation },
  )
}
