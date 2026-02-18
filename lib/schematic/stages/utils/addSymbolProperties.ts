import { SchematicSymbol, SymbolProperty } from "kicadts"
import { createTextEffects } from "../symbols-stage-converters/createTextEffects"

/**
 * Add properties to a KiCad library symbol
 */
export function addSymbolProperties({
  symbol,
  libId,
  description,
  keywords,
  fpFilters,
  footprintRef = "",
  referencePrefix,
}: {
  symbol: SchematicSymbol
  libId: string
  description: string
  keywords: string
  fpFilters: string
  footprintRef?: string
  referencePrefix?: string
}): void {
  const refPrefix = referencePrefix || libId.split(":")[1]?.[0] || "U"

  const properties = [
    {
      key: "Reference",
      value: refPrefix,
      id: 0,
      at: [2.032, 0, 90],
      hide: false,
    },
    { key: "Value", value: refPrefix, id: 1, at: [0, 0, 90], hide: false },
    {
      key: "Footprint",
      value: footprintRef,
      id: 2,
      at: [-1.778, 0, 90],
      hide: true,
    },
    {
      key: "Datasheet",
      value: "~",
      id: 3,
      at: [0, 0, 0],
      hide: true,
    },
    {
      key: "Description",
      value: description,
      id: 4,
      at: [0, 0, 0],
      hide: true,
    },
    {
      key: "ki_keywords",
      value: keywords,
      id: 5,
      at: [0, 0, 0],
      hide: true,
    },
    {
      key: "ki_fp_filters",
      value: fpFilters,
      id: 6,
      at: [0, 0, 0],
      hide: true,
    },
  ]

  for (const prop of properties) {
    symbol.properties.push(
      new SymbolProperty({
        key: prop.key,
        value: prop.value,
        id: prop.id,
        at: prop.at as [number, number, number],
        effects: createTextEffects(1.27, prop.hide),
      }),
    )
  }
}
