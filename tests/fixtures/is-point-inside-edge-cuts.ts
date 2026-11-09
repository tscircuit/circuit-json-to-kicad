import type { GrLine } from "kicadts"

// Even-odd containment across every contour, including interior cutouts.
export const isPointInsideEdgeCuts = (
  lines: GrLine[],
  point: { x: number; y: number },
) => {
  let inside = false
  for (const line of lines) {
    const { start, end } = line
    if (!start || !end) continue
    if (
      start.y > point.y !== end.y > point.y &&
      point.x <
        start.x + ((point.y - start.y) * (end.x - start.x)) / (end.y - start.y)
    )
      inside = !inside
  }
  return inside
}
