import type { SymbolEntry } from "./../../types"

/**
 * Rename a symbol entry to use a new name.
 * Also updates the footprint reference if a footprint name is provided.
 */
export function renameSymbol(params: {
  sym: SymbolEntry
  newName: string
  libraryName: string
  footprintName?: string
}): SymbolEntry {
  const { sym, newName, libraryName, footprintName } = params
  const symbol = sym.symbol
  symbol.libraryId = newName

  if (footprintName) {
    const properties = symbol.properties ?? []
    for (const prop of properties) {
      if (prop.key === "Footprint") {
        prop.value = `${libraryName}:${footprintName}`
      }
    }
  }

  return { symbolName: newName, symbol }
}
