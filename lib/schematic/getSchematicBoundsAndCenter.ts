import type { CircuitJsonUtilObjects } from "@tscircuit/circuit-json-util"
import { hasComponentLevelSymbolPrimitives } from "./stages/utils/hasComponentLevelSymbolPrimitives"

export function getSchematicBoundsAndCenter(
  db: CircuitJsonUtilObjects,
  {
    useComponentLevelSourceGeometry = false,
  }: { useComponentLevelSourceGeometry?: boolean } = {},
) {
  const circuitJson = db.toArray()
  const schematicComponents = db.schematic_component.list()
  const schematicTraces = db.schematic_trace.list()
  const schematicArcs = db.schematic_arc.list()
  const sourceGeometryComponentIds = new Set(
    schematicComponents
      .filter((component) =>
        hasComponentLevelSymbolPrimitives(circuitJson, component),
      )
      .map((component) => component.schematic_component_id),
  )

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  const includePoint = (point: { x: number; y: number }) => {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }

  for (const component of schematicComponents) {
    // Imported KiCad symbols retain their drawing primitives in absolute
    // Circuit JSON coordinates. Their `center` is the KiCad symbol anchor,
    // which is not necessarily the center of the selected multi-unit body, so
    // expanding `size` symmetrically around it can substantially overestimate
    // the page bounds. The primitive loops below provide their actual bounds.
    if (
      useComponentLevelSourceGeometry &&
      sourceGeometryComponentIds.has(component.schematic_component_id)
    ) {
      continue
    }
    const width = component.size?.width ?? 0
    const height = component.size?.height ?? 0
    includePoint({
      x: component.center.x - width / 2,
      y: component.center.y - height / 2,
    })
    includePoint({
      x: component.center.x + width / 2,
      y: component.center.y + height / 2,
    })
  }

  for (const trace of schematicTraces) {
    for (const edge of trace.edges) {
      includePoint(edge.from)
      includePoint(edge.to)
    }
  }

  for (const arc of schematicArcs) {
    includePoint({ x: arc.center.x - arc.radius, y: arc.center.y - arc.radius })
    includePoint({ x: arc.center.x + arc.radius, y: arc.center.y + arc.radius })
  }

  if (useComponentLevelSourceGeometry) {
    for (const line of db.schematic_line.list()) {
      if (
        !line.schematic_component_id ||
        !sourceGeometryComponentIds.has(line.schematic_component_id)
      ) {
        continue
      }
      includePoint({ x: line.x1, y: line.y1 })
      includePoint({ x: line.x2, y: line.y2 })
    }

    for (const path of db.schematic_path.list()) {
      if (
        !path.schematic_component_id ||
        !sourceGeometryComponentIds.has(path.schematic_component_id)
      ) {
        continue
      }
      for (const point of path.points) includePoint(point)
    }

    for (const rect of db.schematic_rect.list()) {
      if (
        !rect.schematic_component_id ||
        !sourceGeometryComponentIds.has(rect.schematic_component_id)
      ) {
        continue
      }
      const halfWidth = rect.width / 2
      const halfHeight = rect.height / 2
      const rotationRadians = (rect.rotation * Math.PI) / 180
      const cos = Math.cos(rotationRadians)
      const sin = Math.sin(rotationRadians)
      for (const corner of [
        { x: -halfWidth, y: -halfHeight },
        { x: halfWidth, y: -halfHeight },
        { x: halfWidth, y: halfHeight },
        { x: -halfWidth, y: halfHeight },
      ]) {
        includePoint({
          x: rect.center.x + corner.x * cos - corner.y * sin,
          y: rect.center.y + corner.x * sin + corner.y * cos,
        })
      }
    }

    for (const circle of db.schematic_circle.list()) {
      if (
        !circle.schematic_component_id ||
        !sourceGeometryComponentIds.has(circle.schematic_component_id)
      ) {
        continue
      }
      includePoint({
        x: circle.center.x - circle.radius,
        y: circle.center.y - circle.radius,
      })
      includePoint({
        x: circle.center.x + circle.radius,
        y: circle.center.y + circle.radius,
      })
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
    hasComponentLevelSourceGeometry: sourceGeometryComponentIds.size > 0,
    center: {
      x: centerX,
      y: centerY,
    },
    bounds: {
      minX,
      minY,
      maxX,
      maxY,
    },
  }
}
