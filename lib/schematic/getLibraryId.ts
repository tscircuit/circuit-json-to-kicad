import type {
  SourceComponentBase,
  SchematicComponent,
  CadComponent,
} from "circuit-json"
import {
  getKicadCompatibleComponentName,
  extractReferencePrefix,
} from "../utils/getKicadCompatibleComponentName"
import { symbols } from "schematic-symbols"

/**
 * Checks if a symbol name is a known builtin symbol from schematic-symbols package.
 */
function isBuiltinSymbol(symbolName: string): boolean {
  return symbolName in symbols
}

export function getLibraryId(
  sourceComp: SourceComponentBase,
  schematicComp: SchematicComponent,
  cadComponent?: CadComponent | null,
): string {
  if (sourceComp.type !== "source_component") {
    if (schematicComp.symbol_name) {
      // Check if it's a builtin symbol from schematic-symbols
      if (isBuiltinSymbol(schematicComp.symbol_name)) {
        return `Device:${schematicComp.symbol_name}`
      }
      return `Custom:${schematicComp.symbol_name}`
    }
    return "Device:Component"
  }

  // Check if there's a symbol_name
  if (schematicComp.symbol_name) {
    // If it's a known builtin symbol, use Device: prefix
    if (isBuiltinSymbol(schematicComp.symbol_name)) {
      return `Device:${schematicComp.symbol_name}`
    }
    // Otherwise it's a custom symbol
    return `Custom:${schematicComp.symbol_name}`
  }

  // Generate ergonomic name using manufacturer part number or footprint string
  const ergonomicName = getKicadCompatibleComponentName(
    sourceComp,
    cadComponent,
  )

  // Extract reference prefix from component name (e.g., "R1" -> "R")
  const refPrefix = extractReferencePrefix(sourceComp.name)

  // Combine prefix with ergonomic name for the library ID
  return `Device:${refPrefix}_${ergonomicName}`
}
