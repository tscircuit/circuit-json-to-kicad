import type { SymbolEntry } from "../../types"

/**
 * Update the footprint reference in a KiCad symbol's properties.
 */
export function updateKicadSymbolFootprint(params: {
  kicadSymbol: SymbolEntry
  kicadLibraryName: string
  kicadFootprintName: string
}): void {
  const { kicadSymbol, kicadLibraryName, kicadFootprintName } = params
  const properties = kicadSymbol.symbol.properties ?? []

  for (const prop of properties) {
    if (prop.key === "Footprint") {
      prop.value = `${kicadLibraryName}:${kicadFootprintName}`
    }
  }
}
