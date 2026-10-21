import type {
  CircuitJson,
  SchematicComponent,
  SchematicPort,
} from "circuit-json"
import { buildSymbolDataFromSchematicPrimitives } from "./buildSymbolDataFromSchematicPrimitives"

export function createGenericChipSymbolData(
  schematicComp: SchematicComponent,
  db: any,
  circuitJson: CircuitJson,
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
  const { x, y } = schematicComp.center

  const boxPath = {
    type: "path",
    fill: true,
    points: [
      { x: x - width / 2, y: y - height / 2 },
      { x: x + width / 2, y: y - height / 2 },
      { x: x + width / 2, y: y + height / 2 },
      { x: x - width / 2, y: y + height / 2 },
      { x: x - width / 2, y: y - height / 2 },
    ],
  }

  // Create ports from schematic ports
  const ports = schematicPorts.map((port) => ({
    x: port.center.x,
    y: port.center.y,
    labels: [port.display_pin_label || `${port.pin_number || 1}`],
    pinNumber: port.pin_number || 1,
  }))

  const { primitives } = buildSymbolDataFromSchematicPrimitives({
    circuitJson,
    schematicComponentId: schematicComp.schematic_component_id,
    schematicSymbol: schematicComp,
  })

  return {
    // The box and attached artwork share Circuit JSON coordinates.
    center: schematicComp.center,
    primitives: [boxPath, ...primitives],
    ports: ports,
    size: { width, height },
  }
}
