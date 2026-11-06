import type { KicadSymbolMetadata } from "@tscircuit/props"
import type { SchematicSymbol } from "circuit-json"
import type { SymbolEntry } from "../../types"
import type {
  KicadLibraryConverterContext,
  ExtractedKicadComponent,
} from "../KicadLibraryConverterTypes"
import { renameKicadSymbol } from "../kicad-library-converter-utils/renameKicadSymbol"
import { updateKicadSymbolFootprint } from "../kicad-library-converter-utils/updateKicadSymbolFootprint"
import { updateBuiltinKicadSymbolFootprint } from "../kicad-library-converter-utils/updateBuiltinKicadSymbolFootprint"
import { componentHasCustomFootprint } from "./ClassifyKicadFootprintsStage"
import { applyKicadSymbolMetadata } from "../kicad-library-converter-utils/applyKicadSymbolMetadata"

// Preserve named-symbol sharing only when the supplied metadata also agrees.
const addedSymbolDefinitions = new Set<string>()

/**
 * Classifies symbols from extracted KiCad components into user and builtin libraries.
 * - Custom symbol (symbol={<symbol>...}) → user library, uses the symbol's actual name
 * - Builtin symbol + custom footprint → first symbol renamed to component name, user library
 * - Builtin symbol + builtin footprint (or subsequent symbols) → builtin library
 *
 * Custom symbols share their named definition only when their metadata agrees.
 */
export function classifyKicadSymbols(ctx: KicadLibraryConverterContext): void {
  // Clear the set for each conversion run
  addedSymbolDefinitions.clear()

  for (const extractedKicadComponent of ctx.extractedKicadComponents) {
    classifySymbolsForComponent({
      ctx,
      extractedKicadComponent,
    })
  }
}

/**
 * Get the footprint name referenced by a symbol's Footprint property.
 * e.g., "tscircuit:resistor_0402" → "resistor_0402"
 */
function getSymbolFootprintRef(kicadSymbol: SymbolEntry): string | null {
  const properties = kicadSymbol.symbol.properties ?? []
  for (const prop of properties) {
    if (prop.key === "Footprint" && prop.value) {
      const parts = prop.value.split(":")
      return (parts.length > 1 ? parts[1] : parts[0]) ?? null
    }
  }
  return null
}

function classifySymbolsForComponent({
  ctx,
  extractedKicadComponent,
}: {
  ctx: KicadLibraryConverterContext
  extractedKicadComponent: ExtractedKicadComponent
}): void {
  const { tscircuitComponentName, kicadSymbols } = extractedKicadComponent
  const hasCustomFootprint = componentHasCustomFootprint(
    extractedKicadComponent,
  )
  let hasAddedUserSymbol = false

  // Build set of custom footprint names to match symbols to custom footprints
  const customFootprintNames = new Set(
    extractedKicadComponent.kicadFootprints
      .filter((fp) => !fp.isBuiltin)
      .map((fp) => fp.footprintName),
  )

  // Get metadata from circuit-json schematic_symbol element
  const builtComponent = ctx.builtTscircuitComponents.find(
    (c) => c.tscircuitComponentName === tscircuitComponentName,
  )
  const schematicSymbol = builtComponent?.circuitJson.find(
    (el): el is SchematicSymbol => el.type === "schematic_symbol",
  )
  const metadata = schematicSymbol?.metadata?.kicad_symbol as
    | KicadSymbolMetadata
    | undefined

  for (const kicadSymbol of kicadSymbols) {
    if (!kicadSymbol.isBuiltin) {
      // Custom symbol → user library
      // Use the symbol's actual name (from JSX <symbol name="...">) for deduplication
      const symbolName = kicadSymbol.symbolName
      const symbolDefinitionKey = JSON.stringify([symbolName, metadata])

      // Reuse a named symbol only when its supplied metadata also agrees.
      if (addedSymbolDefinitions.has(symbolDefinitionKey)) {
        continue
      }

      addedSymbolDefinitions.add(symbolDefinitionKey)

      // Update footprint reference if this component has a custom footprint
      if (hasCustomFootprint) {
        updateKicadSymbolFootprint({
          kicadSymbol,
          kicadLibraryName: ctx.kicadLibraryName,
          kicadFootprintName: tscircuitComponentName,
          isPcm: ctx.isPcm,
        })
      }
      const updatedSymbol = metadata
        ? applyKicadSymbolMetadata(kicadSymbol, metadata)
        : kicadSymbol
      addUserSymbol({ ctx, kicadSymbol: updatedSymbol })
    } else if (hasCustomFootprint && !hasAddedUserSymbol) {
      // Builtin symbol + custom footprint exists on this component.
      // Only use this symbol for the user library if it actually references
      // a custom footprint (not a builtin one like resistor_0402).
      const footprintRef = getSymbolFootprintRef(kicadSymbol)
      const symbolMatchesCustomFootprint =
        footprintRef != null && customFootprintNames.has(footprintRef)

      if (symbolMatchesCustomFootprint) {
        hasAddedUserSymbol = true
        const renamedSymbol = renameKicadSymbol({
          kicadSymbol,
          newKicadSymbolName: tscircuitComponentName,
        })
        updateKicadSymbolFootprint({
          kicadSymbol: renamedSymbol,
          kicadLibraryName: ctx.kicadLibraryName,
          kicadFootprintName: tscircuitComponentName,
          isPcm: ctx.isPcm,
        })
        const updatedSymbol = metadata
          ? applyKicadSymbolMetadata(renamedSymbol, metadata)
          : renamedSymbol
        addUserSymbol({ ctx, kicadSymbol: updatedSymbol })
      } else {
        // This builtin symbol references a builtin footprint → builtin library
        const updatedSymbol = updateBuiltinKicadSymbolFootprint(kicadSymbol, {
          isPcm: ctx.isPcm,
        })
        addBuiltinSymbol({ ctx, kicadSymbol: updatedSymbol })
      }
    } else {
      // Builtin symbol → builtin library (no custom footprint, or already added user symbol)
      const updatedSymbol = updateBuiltinKicadSymbolFootprint(kicadSymbol, {
        isPcm: ctx.isPcm,
      })
      addBuiltinSymbol({ ctx, kicadSymbol: updatedSymbol })
    }
  }
}

function addUserSymbol({
  ctx,
  kicadSymbol,
}: {
  ctx: KicadLibraryConverterContext
  kicadSymbol: SymbolEntry
}): void {
  addSymbolDefinition({ symbols: ctx.userKicadSymbols, kicadSymbol })
}

function addBuiltinSymbol({
  ctx,
  kicadSymbol,
}: {
  ctx: KicadLibraryConverterContext
  kicadSymbol: SymbolEntry
}): void {
  addSymbolDefinition({ symbols: ctx.builtinKicadSymbols, kicadSymbol })
}

function addSymbolDefinition({
  symbols,
  kicadSymbol,
}: {
  symbols: SymbolEntry[]
  kicadSymbol: SymbolEntry
}): void {
  let symbolVariant = kicadSymbol
  let suffix = 2
  while (true) {
    const existingSymbol = symbols.find(
      (symbol) => symbol.symbolName === symbolVariant.symbolName,
    )
    if (!existingSymbol) {
      symbols.push(symbolVariant)
      return
    }
    if (
      existingSymbol.symbol.getString() === symbolVariant.symbol.getString()
    ) {
      return
    }
    symbolVariant = {
      ...renameKicadSymbol({
        kicadSymbol: symbolVariant,
        newKicadSymbolName: `${kicadSymbol.symbolName}_${suffix++}`,
      }),
      isBuiltin: kicadSymbol.isBuiltin,
    }
  }
}
