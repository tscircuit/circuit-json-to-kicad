import { applyToPoint, scale as createScaleMatrix } from "transformation-matrix"
import type { SchematicComponent, SchematicPort } from "circuit-json"

/**
 * Calculate KiCad pin position and rotation from schematic-symbols port
 */
export function calculatePinPosition({
  port,
  center,
  size,
  isChip,
  portIndex,
  schematicComponent,
  schematicPorts,
  c2kMatSchScale,
}: {
  port: any
  center: any
  size?: any
  isChip?: boolean
  portIndex?: number
  schematicComponent?: SchematicComponent
  schematicPorts: SchematicPort[]
  c2kMatSchScale: number
}): { x: number; y: number; angle: number } {
  const symbolScale = c2kMatSchScale

  let portX = port.x ?? 0
  let portY = port.y ?? 0
  let usingCircuitJsonPort = false

  if (isChip && portIndex !== undefined && schematicComponent) {
    const sortedPorts = schematicPorts
      .filter(
        (p: any) =>
          p.schematic_component_id ===
          schematicComponent.schematic_component_id,
      )
      .sort((a: any, b: any) => (a.pin_number || 0) - (b.pin_number || 0))

    if (sortedPorts[portIndex]) {
      const schPort = sortedPorts[portIndex]
      portX = schPort.center.x - schematicComponent.center.x
      portY = schPort.center.y - schematicComponent.center.y
      usingCircuitJsonPort = true
    }
  }

  let dx: number
  let dy: number
  if (usingCircuitJsonPort) {
    dx = portX
    dy = portY
  } else {
    const cx = center?.x ?? 0
    const cy = center?.y ?? 0
    dx = portX - cx
    dy = portY - cy
  }

  const scaleMatrix = createScaleMatrix(symbolScale, symbolScale)
  const scaled = applyToPoint(scaleMatrix, { x: dx, y: dy })

  let isHorizontalPin: boolean
  if (isChip && size) {
    const halfWidth = size.width / 2
    const halfHeight = size.height / 2
    const normalizedDx = Math.abs(dx) / halfWidth
    const normalizedDy = Math.abs(dy) / halfHeight
    isHorizontalPin = normalizedDx > normalizedDy
  } else {
    isHorizontalPin = Math.abs(dx) > Math.abs(dy)
  }

  let x = scaled.x
  let y = scaled.y

  const CHIP_PIN_LENGTH = 6.0

  if (isChip && size) {
    const halfWidth = (size.width / 2) * symbolScale
    const halfHeight = (size.height / 2) * symbolScale

    if (isHorizontalPin) {
      x = dx > 0 ? halfWidth : -halfWidth
      y = dy * symbolScale
    } else {
      x = dx * symbolScale
      y = dy > 0 ? halfHeight : -halfHeight
    }
  }

  // KiCad Pin Angle: 0=left, 180=right, 90=down, 270=up
  let angle = 0
  if (isHorizontalPin) {
    if (dx > 0) {
      angle = 180
      if (isChip) x = x + CHIP_PIN_LENGTH
    } else {
      angle = 0
      if (isChip) x = x - CHIP_PIN_LENGTH
    }
  } else {
    if (dy > 0) {
      angle = 270
      if (isChip) y = y + CHIP_PIN_LENGTH
    } else {
      angle = 90
      if (isChip) y = y - CHIP_PIN_LENGTH
    }
  }

  return { x, y, angle }
}
