import type { CircuitJsonUtilObjects } from "@tscircuit/circuit-json-util"
import type { SchematicComponent, SchematicPort } from "circuit-json"
import { buildSymbolDataFromSchematicPrimitives } from "./buildSymbolDataFromSchematicPrimitives"

export function createGenericChipSymbolData(
  schematicComp: SchematicComponent,
  db: CircuitJsonUtilObjects,
) {
  // Get all ports for this component
  const schematicPorts: SchematicPort[] = db.schematic_port
    .list()
    .filter(
      (p: SchematicPort) =>
        p.schematic_component_id === schematicComp.schematic_component_id,
    )
    .sort(
      (a: SchematicPort, b: SchematicPort) =>
        (a.pin_number || 0) - (b.pin_number || 0),
    )

  // Create box primitives based on component size
  const width = schematicComp.size?.width || 1.5
  const height = schematicComp.size?.height || 1
  const { x: cx, y: cy } = schematicComp.center

  const boxPath = {
    type: "path",
    fill: true,
    points: [
      { x: cx - width / 2, y: cy - height / 2 },
      { x: cx + width / 2, y: cy - height / 2 },
      { x: cx + width / 2, y: cy + height / 2 },
      { x: cx - width / 2, y: cy + height / 2 },
      { x: cx - width / 2, y: cy - height / 2 },
    ],
  }

  // Create ports from schematic ports
  const ports = schematicPorts.map((port) => {
    return {
      x: port.center.x,
      y: port.center.y,
      labels: [port.display_pin_label || `${port.pin_number || 1}`],
      pinNumber: port.pin_number || 1,
    }
  })

  // Box components can carry artwork directly, without a schematic_symbol.
  // Keep it in the same coordinate space as the box; the drawing converter
  // translates all primitives relative to the component center.
  const { primitives } = buildSymbolDataFromSchematicPrimitives({
    circuitJson: db.toArray(),
    schematicComponentId: schematicComp.schematic_component_id,
    schematicSymbol: {
      center: schematicComp.center,
      size: { width, height },
    },
  })

  return {
    center: schematicComp.center,
    primitives: [boxPath, ...primitives],
    ports: ports,
    size: { width, height },
  }
}
