import { KicadSymbolLib } from "kicadts"
import type { KicadLibraryConverterContext } from "../KicadLibraryConverterTypes"
import { generateSymLibTable } from "../kicad-library-converter-utils/generateSymLibTable"
import { generateFpLibTable } from "../kicad-library-converter-utils/generateFpLibTable"

const KICAD_SYM_LIB_VERSION = 20211014
const KICAD_GENERATOR = "circuit-json-to-kicad"

/**
 * Builds the KiCad library files from classified footprints and symbols.
 * Populates ctx.kicadProjectFsMap with the output files.
 */
export function buildKicadLibraryFiles(
  ctx: KicadLibraryConverterContext,
): void {
  buildUserSymbolLibrary(ctx)
  buildBuiltinSymbolLibrary(ctx)
  buildUserFootprintLibrary(ctx)
  buildBuiltinFootprintLibrary(ctx)
  buildLibraryTables(ctx)
}

function buildUserSymbolLibrary(ctx: KicadLibraryConverterContext): void {
  if (ctx.userKicadSymbols.length === 0) return

  const symbolLib = new KicadSymbolLib({
    version: KICAD_SYM_LIB_VERSION,
    generator: KICAD_GENERATOR,
    symbols: ctx.userKicadSymbols.map((s) => s.symbol),
  })

  ctx.kicadProjectFsMap[`symbols/${ctx.kicadLibraryName}.kicad_sym`] =
    symbolLib.getString()
}

function buildBuiltinSymbolLibrary(ctx: KicadLibraryConverterContext): void {
  if (!ctx.includeBuiltins || ctx.builtinKicadSymbols.length === 0) return

  const symbolLib = new KicadSymbolLib({
    version: KICAD_SYM_LIB_VERSION,
    generator: KICAD_GENERATOR,
    symbols: ctx.builtinKicadSymbols.map((s) => s.symbol),
  })

  ctx.kicadProjectFsMap["symbols/tscircuit_builtin.kicad_sym"] =
    symbolLib.getString()
}

function buildUserFootprintLibrary(ctx: KicadLibraryConverterContext): void {
  for (const kicadFootprint of ctx.userKicadFootprints) {
    const filePath = `footprints/${ctx.kicadLibraryName}.pretty/${kicadFootprint.footprintName}.kicad_mod`
    ctx.kicadProjectFsMap[filePath] = kicadFootprint.kicadModString
  }
}

function buildBuiltinFootprintLibrary(ctx: KicadLibraryConverterContext): void {
  if (!ctx.includeBuiltins || ctx.builtinKicadFootprints.length === 0) return

  for (const kicadFootprint of ctx.builtinKicadFootprints) {
    const filePath = `footprints/tscircuit_builtin.pretty/${kicadFootprint.footprintName}.kicad_mod`
    ctx.kicadProjectFsMap[filePath] = kicadFootprint.kicadModString
  }
}

function buildLibraryTables(ctx: KicadLibraryConverterContext): void {
  const hasBuiltinFootprints =
    ctx.includeBuiltins && ctx.builtinKicadFootprints.length > 0
  const hasBuiltinSymbols =
    ctx.includeBuiltins && ctx.builtinKicadSymbols.length > 0

  ctx.kicadProjectFsMap["fp-lib-table"] = generateFpLibTable({
    kicadLibraryName: ctx.kicadLibraryName,
    includeBuiltin: hasBuiltinFootprints,
  })

  ctx.kicadProjectFsMap["sym-lib-table"] = generateSymLibTable({
    kicadLibraryName: ctx.kicadLibraryName,
    includeBuiltin: hasBuiltinSymbols,
  })
}
