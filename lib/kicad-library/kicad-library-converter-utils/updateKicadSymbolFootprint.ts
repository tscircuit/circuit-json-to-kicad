import type { SymbolEntry } from "../../types"

/**
 * Update the footprint reference in a KiCad symbol's properties.
 * When isPcm is true, adds PCM_ prefix to the library name for KiCad PCM distribution.
 */
export function updateKicadSymbolFootprint(params: {
  kicadSymbol: SymbolEntry
  kicadLibraryName: string
  kicadFootprintName: string
  isPcm?: boolean
}): void {
  const { kicadSymbol, kicadLibraryName, kicadFootprintName, isPcm } = params
  const properties = kicadSymbol.symbol.properties ?? []

  const libraryPrefix = isPcm ? `PCM_${kicadLibraryName}` : kicadLibraryName

  for (const prop of properties) {
    if (prop.key === "Footprint") {
      prop.value = `${libraryPrefix}:${kicadFootprintName}`
    }
  }
}
