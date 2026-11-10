import { GrCircle, type GrLine } from "kicadts"

// Even-odd containment across every contour, including interior cutouts.
export const isPointInsideEdgeCuts = (
  edges: (GrLine | GrCircle)[],
  point: { x: number; y: number },
) => {
  let inside = false
  for (const edge of edges) {
    if (edge instanceof GrCircle) {
      const { centerPoint: center, endPoint: end } = edge
      if (
        center &&
        end &&
        Math.hypot(point.x - center.x, point.y - center.y) <
          Math.hypot(end.x - center.x, end.y - center.y)
      ) {
        inside = !inside
      }
      continue
    }
    const { start, end } = edge
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
