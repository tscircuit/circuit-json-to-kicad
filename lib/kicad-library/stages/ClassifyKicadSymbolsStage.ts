import type { SymbolEntry } from "../../types"
import type {
  KicadLibraryConverterContext,
  ExtractedKicadComponent,
} from "../KicadLibraryConverterTypes"
import { renameKicadSymbol } from "../kicad-library-converter-utils/renameKicadSymbol"
import { updateKicadSymbolFootprint } from "../kicad-library-converter-utils/updateKicadSymbolFootprint"
import { updateBuiltinKicadSymbolFootprint } from "../kicad-library-converter-utils/updateBuiltinKicadSymbolFootprint"
import { componentHasCustomFootprint } from "./ClassifyKicadFootprintsStage"

/**
 * Classifies symbols from extracted KiCad components into user and builtin libraries.
 * - Custom symbol (symbol={<symbol>...}) → user library, renamed to component name
 * - Builtin symbol + custom footprint → first symbol renamed to component name, user library
 * - Builtin symbol + builtin footprint (or subsequent symbols) → builtin library
 */
export function classifyKicadSymbols(ctx: KicadLibraryConverterContext): void {
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

  for (const kicadSymbol of kicadSymbols) {
    if (!kicadSymbol.isBuiltin) {
      // Custom symbol → user library
      if (!hasAddedUserSymbol) {
        hasAddedUserSymbol = true
        const renamedSymbol = renameKicadSymbol({
          kicadSymbol,
          newKicadSymbolName: tscircuitComponentName,
        })
        if (hasCustomFootprint) {
          updateKicadSymbolFootprint({
            kicadSymbol: renamedSymbol,
            kicadLibraryName: ctx.kicadLibraryName,
            kicadFootprintName: tscircuitComponentName,
          })
        }
        addUserSymbol({ ctx, kicadSymbol: renamedSymbol })
      } else {
        addUserSymbol({ ctx, kicadSymbol })
      }
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
      })
      addUserSymbol({ ctx, kicadSymbol: renamedSymbol })
    } else {
      // Builtin symbol → builtin library (no custom footprint, or already added user symbol)
      const updatedSymbol = updateBuiltinKicadSymbolFootprint(kicadSymbol)
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
  const alreadyExists = ctx.userKicadSymbols.some(
    (s) => s.symbolName === kicadSymbol.symbolName,
  )
  if (!alreadyExists) {
    ctx.userKicadSymbols.push(kicadSymbol)
  }
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
