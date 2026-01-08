import type { SymbolEntry } from "./../../types"

/**
 * Update a builtin symbol's footprint reference to point to tscircuit_builtin library.
 */
export function updateBuiltinSymbolFootprint(sym: SymbolEntry): SymbolEntry {
  const symbol = sym.symbol
  const properties = symbol.properties ?? []

  for (const prop of properties) {
    if (prop.key === "Footprint" && prop.value) {
      const parts = prop.value.split(":")
      const footprintName = parts.length > 1 ? parts[1] : parts[0]
      prop.value = `tscircuit_builtin:${footprintName}`
    }
  }

  return { symbolName: sym.symbolName, symbol }
}
