import type { SymbolEntry } from "../../types"

/**
 * Rename a KiCad symbol entry to use a new name.
 * Updates child symbol units (subSymbols) to match the new name.
 */
export function renameKicadSymbol(params: {
  kicadSymbol: SymbolEntry
  newKicadSymbolName: string
}): SymbolEntry {
  const { kicadSymbol, newKicadSymbolName } = params
  const symbol = kicadSymbol.symbol
  const oldName = symbol.libraryId

  // Update main symbol name
  symbol.libraryId = newKicadSymbolName

  // Update child symbol unit names (e.g., "OldName_0_1" -> "NewName_0_1")
  if (oldName && symbol.subSymbols) {
    for (const subSymbol of symbol.subSymbols) {
      if (subSymbol.libraryId?.startsWith(oldName)) {
        const suffix = subSymbol.libraryId.slice(oldName.length)
        subSymbol.libraryId = newKicadSymbolName + suffix
      }
    }
  }

  return { symbolName: newKicadSymbolName, symbol }
}
