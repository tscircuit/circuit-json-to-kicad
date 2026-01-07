import type {
  SourceComponentBase,
  SchematicComponent,
  CadComponent,
} from "circuit-json"
import {
  getKicadCompatibleComponentName,
  extractReferencePrefix,
  isReferenceDesignator,
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
  const ergonomicName = getKicadCompatibleComponentName(
    sourceComp,
    cadComponent,
  )

  const name = sourceComp.name

  // If the component has a user-defined name (not a reference designator),
  // use just the ergonomic name for the library ID to make it easier to identify
  if (name && !isReferenceDesignator(name)) {
    return `Device:${ergonomicName}`
  }

  // For standard components (R1, C1, etc.), use prefix + ergonomic name
  const refPrefix = extractReferencePrefix(name)

  return `Device:${refPrefix}_${ergonomicName}`
}
