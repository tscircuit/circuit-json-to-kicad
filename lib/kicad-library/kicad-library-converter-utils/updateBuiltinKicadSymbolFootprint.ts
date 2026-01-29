import type { SymbolEntry } from "../../types"

/**
 * Update a builtin KiCad symbol's footprint reference to point to tscircuit_builtin library.
 * When isPcm is true, adds PCM_ prefix to the library name for KiCad PCM distribution.
 */
export function updateBuiltinKicadSymbolFootprint(
  kicadSymbol: SymbolEntry,
  options?: { isPcm?: boolean },
): SymbolEntry {
  const symbol = kicadSymbol.symbol
  const properties = symbol.properties ?? []

  const libraryName = options?.isPcm
    ? "PCM_tscircuit_builtin"
    : "tscircuit_builtin"

  for (const prop of properties) {
    if (prop.key === "Footprint" && prop.value) {
      const parts = prop.value.split(":")
      const footprintName = parts.length > 1 ? parts[1] : parts[0]
      prop.value = `${libraryName}:${footprintName}`
    }
  }

  return { symbolName: kicadSymbol.symbolName, symbol }
}
