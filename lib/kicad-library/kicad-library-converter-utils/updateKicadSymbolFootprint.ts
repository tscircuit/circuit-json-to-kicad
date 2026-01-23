import type { SymbolEntry } from "../../types"

/**
 * Update the footprint reference in a KiCad symbol's properties.
 */
export function updateKicadSymbolFootprint(params: {
  kicadSymbol: SymbolEntry
  kicadLibraryName: string
  kicadFootprintName: string
  /** When true, prepend PCM_ to the library name for KiCad PCM compatibility */
  forPcm?: boolean
}): void {
  const { kicadSymbol, kicadLibraryName, kicadFootprintName, forPcm } = params
  const properties = kicadSymbol.symbol.properties ?? []

  const effectiveKicadLibraryName = forPcm
    ? `PCM_${kicadLibraryName}`
    : kicadLibraryName

  for (const prop of properties) {
    if (prop.key === "Footprint") {
      prop.value = `${effectiveKicadLibraryName}:${kicadFootprintName}`
    }
  }
}
