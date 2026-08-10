import type {
  CadComponent,
  SchematicComponent,
  SourceComponentBase,
  SourceSimplePinHeader,
} from "circuit-json"
import { symbols } from "schematic-symbols"
import {
  getKicadCompatibleComponentName,
  getReferencePrefixForComponent,
} from "../utils/getKicadCompatibleComponentName"

/**
 * Checks if a symbol name is a known builtin symbol from schematic-symbols package.
 */
function isBuiltinSymbol(symbolName: string): boolean {
  return symbolName in symbols
}

function getConnectorGenericLibraryId(pinCount: number): string {
  return `Connector_Generic:Conn_01x${String(pinCount).padStart(2, "0")}`
}

/**
 * Get the library ID for a component's symbol.
 *
 * @param sourceComp - The source component
 * @param schematicComp - The schematic component
 * @param cadComponent - Optional CAD component for footprinter_string
 * @param schematicSymbolName - Optional name from schematic_symbol element (highest priority)
 * @param connectorPinCount - Optional rendered schematic pin count for simple connectors
 * @returns Library ID string like "Device:resistor" or "Custom:my_symbol"
 */
export function getLibraryId(
  sourceComp: SourceComponentBase,
  schematicComp: SchematicComponent,
  cadComponent?: CadComponent | null,
  schematicSymbolName?: string,
  connectorPinCount?: number,
): string {
  // Highest priority: schematic_symbol.name (for custom symbols)
  if (schematicSymbolName) {
    return `Custom:${schematicSymbolName}`
  }

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
  if (sourceComp.ftype === "simple_pin_header") {
    const pinCount = (sourceComp as SourceSimplePinHeader).pin_count
    return getConnectorGenericLibraryId(pinCount)
  }

  if (
    sourceComp.ftype === "simple_connector" &&
    connectorPinCount &&
    connectorPinCount > 0
  ) {
    return getConnectorGenericLibraryId(connectorPinCount)
  }

  // Generate ergonomic name using manufacturer part number or footprint string
  const ergonomicName = getKicadCompatibleComponentName(
    sourceComp,
    cadComponent,
  )

  // Extract reference prefix from component name (e.g., "R1" -> "R")
  const refPrefix = getReferencePrefixForComponent(sourceComp)

  // Combine prefix with ergonomic name for the library ID
  return `Device:${refPrefix}_${ergonomicName}`
}
