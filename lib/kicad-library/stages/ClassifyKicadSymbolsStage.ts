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

// Track symbol names that have been added for deduplication
const addedSymbolNames = new Set<string>()

/**
 * Classifies symbols from extracted KiCad components into user and builtin libraries.
 * - Custom symbol (symbol={<symbol>...}) → user library, uses the symbol's actual name
 * - Builtin symbol + custom footprint → first symbol renamed to component name, user library
 * - Builtin symbol + builtin footprint (or subsequent symbols) → builtin library
 *
 * Custom symbols are deduplicated by their actual symbol name (from the JSX <symbol name="...">).
 */
export function classifyKicadSymbols(ctx: KicadLibraryConverterContext): void {
  // Clear the set for each conversion run
  addedSymbolNames.clear()

  for (const extractedKicadComponent of ctx.extractedKicadComponents) {
    classifySymbolsForComponent({
      ctx,
      extractedKicadComponent,
    })
  }
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

      // Check if a symbol with this name already exists
      // If so, skip this symbol (reuse the existing one)
      if (addedSymbolNames.has(symbolName)) {
        continue
      }

      // Track this symbol name as added
      addedSymbolNames.add(symbolName)

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
      // Builtin symbol but has custom footprint → rename and add to user library
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
  // Check for duplicate by symbolName (secondary check, primary deduplication is in classifySymbolsForComponent)
  const alreadyExistsByName = ctx.userKicadSymbols.some(
    (s) => s.symbolName === kicadSymbol.symbolName,
  )
  if (alreadyExistsByName) {
    return
  }

  ctx.userKicadSymbols.push(kicadSymbol)
}

function addBuiltinSymbol({
  ctx,
  kicadSymbol,
}: {
  ctx: KicadLibraryConverterContext
  kicadSymbol: SymbolEntry
}): void {
  const alreadyExists = ctx.builtinKicadSymbols.some(
    (s) => s.symbolName === kicadSymbol.symbolName,
  )
  if (!alreadyExists) {
    ctx.builtinKicadSymbols.push(kicadSymbol)
  }
}
