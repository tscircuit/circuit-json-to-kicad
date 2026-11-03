export const getRectanglePoints = (rect: {
  width: number
  height: number
  corner_radius?: number
}) => {
  const halfWidth = rect.width / 2
  const halfHeight = rect.height / 2
  const radius = Math.min(
    Math.max(rect.corner_radius ?? 0, 0),
    halfWidth,
    halfHeight,
  )

  if (radius === 0) {
    return [
      { x: -halfWidth, y: -halfHeight },
      { x: halfWidth, y: -halfHeight },
      { x: halfWidth, y: halfHeight },
      { x: -halfWidth, y: halfHeight },
    ]
  }

  const corners = [
    { x: halfWidth - radius, y: halfHeight - radius, start: 0 },
    { x: -halfWidth + radius, y: halfHeight - radius, start: 90 },
    { x: -halfWidth + radius, y: -halfHeight + radius, start: 180 },
    { x: halfWidth - radius, y: -halfHeight + radius, start: 270 },
  ]

  return corners.flatMap((corner) =>
    Array.from({ length: 9 }, (_, index) => {
      const angle = ((corner.start + (index * 90) / 8) * Math.PI) / 180
      return {
        x: corner.x + radius * Math.cos(angle),
        y: corner.y + radius * Math.sin(angle),
      }
    }),
  )
}
