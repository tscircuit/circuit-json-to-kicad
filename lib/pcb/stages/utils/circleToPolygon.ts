const CIRCLE_APPROX_SEGMENT_LENGTH = 0.2
const CIRCLE_APPROX_MIN_STEPS = 16
const CIRCLE_APPROX_MAX_STEPS = 128

export const circleToPolygon = (
  center: { x: number; y: number },
  radius: number,
): [number, number][] => {
  const circumference = 2 * Math.PI * radius
  let steps = Math.ceil(circumference / CIRCLE_APPROX_SEGMENT_LENGTH)
  steps = Math.max(
    CIRCLE_APPROX_MIN_STEPS,
    Math.min(CIRCLE_APPROX_MAX_STEPS, steps),
  )

  const pts: [number, number][] = []
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2
    pts.push([
      center.x + radius * Math.cos(angle),
      center.y + radius * Math.sin(angle),
    ])
  }
  return pts
}
