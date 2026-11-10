import type { MultiPolygon } from "polygon-clipping"

// Positive in the filled area, negative outside it (including inside holes).
export const signedDistanceToPolygon = (
  x: number,
  y: number,
  geometry: MultiPolygon,
): number => {
  let inside = false
  let minDistanceSquared = Infinity

  for (const polygon of geometry) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length; i++) {
        const [ax, ay] = ring[i]!
        const [bx, by] = ring[(i + 1) % ring.length]!
        const dx = bx - ax
        const dy = by - ay
        const lengthSquared = dx * dx + dy * dy
        if (lengthSquared === 0) continue

        // Project onto the segment, including its endpoints.
        const px = x - ax
        const py = y - ay
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSquared))
        const distanceSquared = (px - t * dx) ** 2 + (py - t * dy) ** 2
        minDistanceSquared = Math.min(minDistanceSquared, distanceSquared)

        // Count crossings of a horizontal ray across all exterior and hole rings.
        if (ay > y !== by > y && px < (py * dx) / dy) inside = !inside
      }
    }
  }

  const distance = Math.sqrt(minDistanceSquared)
  return inside ? distance : -distance
}
