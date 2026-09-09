import type { CircuitJson, SchematicComponent } from "circuit-json"

const componentPrimitiveTypes = new Set([
  "schematic_path",
  "schematic_circle",
  "schematic_arc",
  "schematic_line",
  "schematic_rect",
])

export function hasComponentLevelSymbolPrimitives(
  circuitJson: CircuitJson,
  schematicComponent: SchematicComponent,
): boolean {
  const schematicComponentId = schematicComponent.schematic_component_id
  if (
    schematicComponent.is_box_with_pins !== false ||
    schematicComponent.symbol_name ||
    "schematic_symbol_id" in schematicComponent ||
    circuitJson.some(
      (element: any) =>
        element.schematic_component_id === schematicComponentId &&
        element.schematic_symbol_id,
    )
  ) {
    return false
  }

  return circuitJson.some(
    (element: any) =>
      componentPrimitiveTypes.has(element.type) &&
      element.schematic_component_id === schematicComponentId &&
      !element.schematic_symbol_id,
  )
}
