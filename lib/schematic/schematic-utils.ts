import type { AnySourceComponent, SchematicComponent } from "circuit-json"

export function getLibraryId(
  sourceComp: AnySourceComponent,
  schematicComp: SchematicComponent,
): string {
  if (sourceComp.type !== "source_component") {
    if (schematicComp.symbol_name) {
      return `Custom:${schematicComp.symbol_name}`
    }
    return "Device:Component"
  }

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

  if (schematicComp.symbol_name) {
    return `Custom:${schematicComp.symbol_name}`
  }

  return "Device:Component"
}
