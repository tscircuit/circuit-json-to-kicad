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
    return `Device:R_${sourceComp.source_component_id}`
  }
  if (sourceComp.ftype === "simple_capacitor") {
    return `Device:C_${sourceComp.source_component_id}`
  }
  if (sourceComp.ftype === "simple_inductor") {
    return `Device:L_${sourceComp.source_component_id}`
  }
  if (sourceComp.ftype === "simple_diode") {
    return `Device:D_${sourceComp.source_component_id}`
  }
  if (sourceComp.ftype === "simple_chip") {
    return `Device:U_${sourceComp.source_component_id}`
  }

  if (schematicComp.symbol_name) {
    return `Custom:${schematicComp.symbol_name}`
  }

  return `Device:Component_${sourceComp.source_component_id}`
}
