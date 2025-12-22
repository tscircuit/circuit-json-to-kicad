import type {
  SourceComponentBase,
  SchematicComponent,
  CadComponent,
} from "circuit-json"
import {
  getKicadCompatibleComponentName,
  extractReferencePrefix,
} from "../utils/getKicadCompatibleComponentName"

export function getLibraryId(
  sourceComp: SourceComponentBase,
  schematicComp: SchematicComponent,
  cadComponent?: CadComponent | null,
): string {
  if (sourceComp.type !== "source_component") {
    if (schematicComp.symbol_name) {
      return `Custom:${schematicComp.symbol_name}`
    }
    return "Device:Component"
  }

  // Use custom symbol name if provided
  if (schematicComp.symbol_name) {
    return `Custom:${schematicComp.symbol_name}`
  }

  // Generate ergonomic name using manufacturer part number or footprint string
  const ergonomicName = getKicadCompatibleComponentName(sourceComp, cadComponent)

  // Extract reference prefix from component name (e.g., "R1" -> "R")
  const refPrefix = extractReferencePrefix(sourceComp.name)

  // Combine prefix with ergonomic name for the library ID
  return `Device:${refPrefix}_${ergonomicName}`
}
