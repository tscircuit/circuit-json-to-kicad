import type { CircuitJsonUtilObjects } from "@tscircuit/circuit-json-util";


export function getSchematicBoundsAndCenter(db: CircuitJsonUtilObjects) {
  const schematicComponents = db.schematic_component.list()
  const schematicTraces = db.schematic_trace.list()

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const component of schematicComponents) {
    const width = component.size?.width ?? 0
    const height = component.size?.height ?? 0
    minX = Math.min(minX, component.center.x - width / 2)
    minY = Math.min(minY, component.center.y - height / 2)
    maxX = Math.max(maxX, component.center.x + width / 2)
    maxY = Math.max(maxY, component.center.y + height / 2)
  }

  for (const trace of schematicTraces) {
    for (const edge of trace.edges) {
      minX = Math.min(minX, edge.from.x, edge.to.x)
      minY = Math.min(minY, edge.from.y, edge.to.y)
      maxX = Math.max(maxX, edge.from.x, edge.to.x)
      maxY = Math.max(maxY, edge.from.y, edge.to.y)
    }
  }

  if (minX === Infinity) {
    minX = 0
    minY = 0
    maxX = 0
    maxY = 0
  }

  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  return {
    x: centerX,
    y: centerY,
  }
}