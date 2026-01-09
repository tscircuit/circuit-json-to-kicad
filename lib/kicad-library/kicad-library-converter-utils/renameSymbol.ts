import type { SymbolEntry } from "./../../types"

/**
 * Rename a symbol entry to use a new name.
 * Also updates the footprint reference if a footprint name is provided.
 * Updates child symbol units (subSymbols) to match the new name.
 */
export function renameSymbol(params: {
  sym: SymbolEntry
  newName: string
  libraryName: string
  footprintName?: string
}): SymbolEntry {
  const { sym, newName, libraryName, footprintName } = params
  const symbol = sym.symbol
  const oldName = symbol.libraryId

  // Update main symbol name
  symbol.libraryId = newName

  // Update child symbol unit names (e.g., "OldName_0_1" -> "NewName_0_1")
  if (oldName && symbol.subSymbols) {
    for (const subSymbol of symbol.subSymbols) {
      if (subSymbol.libraryId?.startsWith(oldName)) {
        const suffix = subSymbol.libraryId.slice(oldName.length)
        subSymbol.libraryId = newName + suffix
      }
    }
  }

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
