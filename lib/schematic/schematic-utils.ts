import type { AnySourceComponent, SchematicComponent } from "circuit-json"

export function getLibraryId(
  sourceComp: AnySourceComponent,
  schematicComp: SchematicComponent,
): string {
  // Type guard to ensure we'''re dealing with a component that has '''ftype'''
  if (sourceComp.type !== "source_component") {
    // Not a component, return a default/fallback
    if (schematicComp.symbol_name) {
      return `Custom:${schematicComp.symbol_name}`
    }
    return "Device:Component"
  }

  // Map common component types to KiCad library IDs
  if (sourceComp.ftype === "simple_resistor") {
    return "Device:R"
  }
  if (sourceComp.ftype === "simple_capacitor") {
    return "Device:C"
  }
  if (sourceComp.ftype === "simple_inductor") {
    return "Device:L"
  }
  if (sourceComp.ftype === "simple_diode") {
    return "Device:D"
  }
  if (sourceComp.ftype === "simple_chip") {
    return "Device:U"
  }

  // Default: use a custom name based on the symbol name if available
  if (schematicComp.symbol_name) {
    return `Custom:${schematicComp.symbol_name}`
  }

  // Final fallback for components with no symbol name
  return "Device:Component"
}
