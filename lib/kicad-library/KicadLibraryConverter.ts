import { KicadSymbolLib } from "kicadts"
import { CircuitJsonToKicadLibraryConverter } from "./CircuitJsonToKicadLibraryConverter"
import type { SymbolEntry, FootprintEntry } from "../types"
import type {
  KicadLibraryConverterOptions,
  KicadLibraryConverterOutput,
} from "./KicadLibraryConverterTypes"
import { renameFootprint } from "./kicad-library-converter-utils/renameFootprint"
import { generateSymLibTable } from "./kicad-library-converter-utils/generateSymLibTable"
import { generateFpLibTable } from "./kicad-library-converter-utils/generateFpLibTable"
import { updateBuiltinSymbolFootprint } from "./kicad-library-converter-utils/updateBuiltinSymbolFootprint"
import { renameSymbol } from "./kicad-library-converter-utils/renameSymbol"

export type { KicadLibraryConverterOptions, KicadLibraryConverterOutput }

const KICAD_SYM_LIB_VERSION = 20211014
const GENERATOR = "circuit-json-to-kicad"

/**
 * Converts tscircuit component files to a KiCad library.
 */
export class KicadLibraryConverter {
  private options: KicadLibraryConverterOptions
  private output: KicadLibraryConverterOutput | null = null

  constructor(options: KicadLibraryConverterOptions) {
    this.options = options
  }

  async run(): Promise<void> {
    const libraryName = this.options.libraryName ?? "tscircuit_library"
    const includeBuiltins = this.options.includeBuiltins ?? true

    const componentCircuitJsons = await this.collectComponentCircuitJsons()
    const {
      userFootprints,
      userSymbols,
      builtinFootprints,
      builtinSymbols,
      model3dPaths,
    } = this.processComponents(componentCircuitJsons, libraryName)

    this.output = {
      kicadProjectFsMap: this.buildOutputFileMap(
        libraryName,
        includeBuiltins,
        userFootprints,
        userSymbols,
        builtinFootprints,
        builtinSymbols,
      ),
      model3dSourcePaths: model3dPaths,
      libraryName,
    }
  }

  private async collectComponentCircuitJsons() {
    const results: Array<{ componentName: string; circuitJson: any }> = []

    for (const filePath of this.options.filePaths) {
      const exports = await this.options.getExportsFromTsxFile(filePath)
      const componentExports = exports.filter((name) => /^[A-Z]/.test(name))

      for (const exportName of componentExports) {
        let componentPath = filePath
        if (this.options.resolveExportPath) {
          const resolved = await this.options.resolveExportPath(
            filePath,
            exportName,
          )
          if (resolved) componentPath = resolved
        }

        const circuitJson = await this.options.buildFileToCircuitJson(
          componentPath,
          exportName,
        )
        if (
          circuitJson &&
          (!Array.isArray(circuitJson) || circuitJson.length > 0)
        ) {
          results.push({ componentName: exportName, circuitJson })
        }
      }
    }
    return results
  }

  private processComponents(
    componentCircuitJsons: Array<{ componentName: string; circuitJson: any }>,
    libraryName: string,
  ) {
    const userFootprints: FootprintEntry[] = []
    const userSymbols: SymbolEntry[] = []
    const builtinFootprints: FootprintEntry[] = []
    const builtinSymbols: SymbolEntry[] = []
    const model3dPaths: string[] = []

    for (const { componentName, circuitJson } of componentCircuitJsons) {
      const libConverter = new CircuitJsonToKicadLibraryConverter(circuitJson, {
        libraryName,
        footprintLibraryName: libraryName,
      })
      libConverter.runUntilFinished()
      const libOutput = libConverter.getOutput()

      const foundPrimaryCustom = this.processFootprints(
        libOutput.footprints,
        componentName,
        libraryName,
        userFootprints,
        builtinFootprints,
      )

      this.processSymbols(
        libOutput.symbols,
        componentName,
        libraryName,
        foundPrimaryCustom,
        userSymbols,
        builtinSymbols,
      )

      for (const path of libOutput.model3dSourcePaths) {
        if (!model3dPaths.includes(path)) model3dPaths.push(path)
      }
    }

    return {
      userFootprints,
      userSymbols,
      builtinFootprints,
      builtinSymbols,
      model3dPaths,
    }
  }

  private processFootprints(
    footprints: FootprintEntry[],
    componentName: string,
    libraryName: string,
    userFootprints: FootprintEntry[],
    builtinFootprints: FootprintEntry[],
  ): boolean {
    let foundPrimaryCustom = false

    for (const fp of footprints) {
      if (fp.isBuiltin) {
        if (
          !builtinFootprints.some((f) => f.footprintName === fp.footprintName)
        ) {
          builtinFootprints.push(fp)
        }
      } else if (!foundPrimaryCustom) {
        foundPrimaryCustom = true
        const renamedFp = renameFootprint(fp, componentName, libraryName)
        if (!userFootprints.some((f) => f.footprintName === componentName)) {
          userFootprints.push(renamedFp)
        }
      } else if (
        !userFootprints.some((f) => f.footprintName === fp.footprintName)
      ) {
        userFootprints.push(fp)
      }
    }

    return foundPrimaryCustom
  }

  private processSymbols(
    symbols: SymbolEntry[],
    componentName: string,
    libraryName: string,
    foundPrimaryCustom: boolean,
    userSymbols: SymbolEntry[],
    builtinSymbols: SymbolEntry[],
  ): void {
    const footprintNameForSymbol = foundPrimaryCustom
      ? componentName
      : undefined
    let userSymbolName: string | null = null

    // Find user symbol by exact name match
    for (const sym of symbols) {
      if (sym.symbolName.toLowerCase() === componentName.toLowerCase()) {
        userSymbolName = sym.symbolName
        const renamedSym = renameSymbol(
          sym,
          componentName,
          libraryName,
          footprintNameForSymbol,
        )
        if (!userSymbols.some((s) => s.symbolName === componentName)) {
          userSymbols.push(renamedSym)
        }
        break
      }
    }

    // Single symbol with custom footprint becomes user symbol
    if (!userSymbolName && symbols.length === 1 && foundPrimaryCustom) {
      userSymbolName = symbols[0]!.symbolName
      const renamedSym = renameSymbol(
        symbols[0]!,
        componentName,
        libraryName,
        footprintNameForSymbol,
      )
      if (!userSymbols.some((s) => s.symbolName === componentName)) {
        userSymbols.push(renamedSym)
      }
    }

    // Remaining symbols are builtins
    for (const sym of symbols) {
      if (sym.symbolName !== userSymbolName) {
        if (!builtinSymbols.some((s) => s.symbolName === sym.symbolName)) {
          builtinSymbols.push(updateBuiltinSymbolFootprint(sym))
        }
      }
    }
  }

  private buildOutputFileMap(
    libraryName: string,
    includeBuiltins: boolean,
    userFootprints: FootprintEntry[],
    userSymbols: SymbolEntry[],
    builtinFootprints: FootprintEntry[],
    builtinSymbols: SymbolEntry[],
  ): Record<string, string | Buffer> {
    const fsMap: Record<string, string | Buffer> = {}

    // User symbols
    if (userSymbols.length > 0) {
      const symbolLib = new KicadSymbolLib({
        version: KICAD_SYM_LIB_VERSION,
        generator: GENERATOR,
        symbols: userSymbols.map((s) => s.symbol),
      })
      fsMap[`symbols/${libraryName}.kicad_sym`] = symbolLib.getString()
    }

    // Builtin symbols
    if (includeBuiltins && builtinSymbols.length > 0) {
      const builtinSymbolLib = new KicadSymbolLib({
        version: KICAD_SYM_LIB_VERSION,
        generator: GENERATOR,
        symbols: builtinSymbols.map((s) => s.symbol),
      })
      fsMap["symbols/tscircuit_builtin.kicad_sym"] =
        builtinSymbolLib.getString()
    }

    // User footprints
    for (const fp of userFootprints) {
      fsMap[`footprints/${libraryName}.pretty/${fp.footprintName}.kicad_mod`] =
        fp.kicadModString
    }

    // Builtin footprints
    if (includeBuiltins && builtinFootprints.length > 0) {
      for (const fp of builtinFootprints) {
        fsMap[
          `footprints/tscircuit_builtin.pretty/${fp.footprintName}.kicad_mod`
        ] = fp.kicadModString
      }
    }

    // Library tables
    fsMap["fp-lib-table"] = generateFpLibTable(
      libraryName,
      includeBuiltins && builtinFootprints.length > 0,
    )
    fsMap["sym-lib-table"] = generateSymLibTable(
      libraryName,
      includeBuiltins && builtinSymbols.length > 0,
    )

    return fsMap
  }

  getOutput(): KicadLibraryConverterOutput {
    if (!this.output) {
      throw new Error(
        "Converter has not been run yet. Call run() before getOutput().",
      )
    }
    return this.output
  }
}
