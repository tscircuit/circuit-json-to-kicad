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

interface BuiltTscircuitComponent {
  componentName: string
  circuitJson: any
}

interface KicadLibraryConverterContext {
  libraryName: string
  includeBuiltins: boolean
  userFootprints: FootprintEntry[]
  userSymbols: SymbolEntry[]
  builtinFootprints: FootprintEntry[]
  builtinSymbols: SymbolEntry[]
  model3dPaths: string[]
}

/**
 * Converts tscircuit component files to a KiCad library.
 */
export class KicadLibraryConverter {
  private options: KicadLibraryConverterOptions
  private output: KicadLibraryConverterOutput | null = null
  private ctx: KicadLibraryConverterContext

  constructor(options: KicadLibraryConverterOptions) {
    this.options = options
    this.ctx = {
      libraryName: options.libraryName ?? "tscircuit_library",
      includeBuiltins: options.includeBuiltins ?? true,
      userFootprints: [],
      userSymbols: [],
      builtinFootprints: [],
      builtinSymbols: [],
      model3dPaths: [],
    }
  }

  async run(): Promise<void> {
    const builtComponents = await this.collectComponentCircuitJsons()
    this.processComponents(builtComponents)

    this.output = {
      kicadProjectFsMap: this.buildOutputFileMap(),
      model3dSourcePaths: this.ctx.model3dPaths,
      libraryName: this.ctx.libraryName,
    }
  }

  private async collectComponentCircuitJsons(): Promise<
    BuiltTscircuitComponent[]
  > {
    const results: BuiltTscircuitComponent[] = []

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

  private processComponents(builtComponents: BuiltTscircuitComponent[]): void {
    for (const { componentName, circuitJson } of builtComponents) {
      const libConverter = new CircuitJsonToKicadLibraryConverter(circuitJson, {
        libraryName: this.ctx.libraryName,
        footprintLibraryName: this.ctx.libraryName,
      })
      libConverter.runUntilFinished()
      const libOutput = libConverter.getOutput()

      const foundPrimaryCustom = this.processFootprints(
        libOutput.footprints,
        componentName,
      )
      this.processSymbols(libOutput.symbols, componentName, foundPrimaryCustom)

      for (const path of libOutput.model3dSourcePaths) {
        if (!this.ctx.model3dPaths.includes(path)) {
          this.ctx.model3dPaths.push(path)
        }
      }
    }
  }

  private processFootprints(
    footprints: FootprintEntry[],
    componentName: string,
  ): boolean {
    let foundPrimaryCustom = false

    for (const fp of footprints) {
      if (fp.isBuiltin) {
        if (
          !this.ctx.builtinFootprints.some(
            (f) => f.footprintName === fp.footprintName,
          )
        ) {
          this.ctx.builtinFootprints.push(fp)
        }
      } else if (!foundPrimaryCustom) {
        foundPrimaryCustom = true
        const renamedFp = renameFootprint({
          fp,
          newName: componentName,
          libraryName: this.ctx.libraryName,
        })
        if (
          !this.ctx.userFootprints.some(
            (f) => f.footprintName === componentName,
          )
        ) {
          this.ctx.userFootprints.push(renamedFp)
        }
      } else if (
        !this.ctx.userFootprints.some(
          (f) => f.footprintName === fp.footprintName,
        )
      ) {
        this.ctx.userFootprints.push(fp)
      }
    }

    return foundPrimaryCustom
  }

  private processSymbols(
    symbols: SymbolEntry[],
    componentName: string,
    foundPrimaryCustom: boolean,
  ): void {
    const footprintNameForSymbol = foundPrimaryCustom
      ? componentName
      : undefined
    let userSymbolName: string | null = null

    // Find user symbol by exact name match
    for (const sym of symbols) {
      if (sym.symbolName.toLowerCase() === componentName.toLowerCase()) {
        userSymbolName = sym.symbolName
        const renamedSym = renameSymbol({
          sym,
          newName: componentName,
          libraryName: this.ctx.libraryName,
          footprintName: footprintNameForSymbol,
        })
        if (!this.ctx.userSymbols.some((s) => s.symbolName === componentName)) {
          this.ctx.userSymbols.push(renamedSym)
        }
        break
      }
    }

    // Single symbol with custom footprint becomes user symbol
    if (!userSymbolName && symbols.length === 1 && foundPrimaryCustom) {
      userSymbolName = symbols[0]!.symbolName
      const renamedSym = renameSymbol({
        sym: symbols[0]!,
        newName: componentName,
        libraryName: this.ctx.libraryName,
        footprintName: footprintNameForSymbol,
      })
      if (!this.ctx.userSymbols.some((s) => s.symbolName === componentName)) {
        this.ctx.userSymbols.push(renamedSym)
      }
    }

    // Remaining symbols are builtins
    for (const sym of symbols) {
      if (sym.symbolName !== userSymbolName) {
        if (
          !this.ctx.builtinSymbols.some((s) => s.symbolName === sym.symbolName)
        ) {
          this.ctx.builtinSymbols.push(updateBuiltinSymbolFootprint(sym))
        }
      }
    }
  }

  private buildOutputFileMap(): Record<string, string | Buffer> {
    const fsMap: Record<string, string | Buffer> = {}

    // User symbols
    if (this.ctx.userSymbols.length > 0) {
      const symbolLib = new KicadSymbolLib({
        version: KICAD_SYM_LIB_VERSION,
        generator: GENERATOR,
        symbols: this.ctx.userSymbols.map((s) => s.symbol),
      })
      fsMap[`symbols/${this.ctx.libraryName}.kicad_sym`] = symbolLib.getString()
    }

    // Builtin symbols
    if (this.ctx.includeBuiltins && this.ctx.builtinSymbols.length > 0) {
      const builtinSymbolLib = new KicadSymbolLib({
        version: KICAD_SYM_LIB_VERSION,
        generator: GENERATOR,
        symbols: this.ctx.builtinSymbols.map((s) => s.symbol),
      })
      fsMap["symbols/tscircuit_builtin.kicad_sym"] =
        builtinSymbolLib.getString()
    }

    // User footprints
    for (const fp of this.ctx.userFootprints) {
      fsMap[
        `footprints/${this.ctx.libraryName}.pretty/${fp.footprintName}.kicad_mod`
      ] = fp.kicadModString
    }

    // Builtin footprints
    if (this.ctx.includeBuiltins && this.ctx.builtinFootprints.length > 0) {
      for (const fp of this.ctx.builtinFootprints) {
        fsMap[
          `footprints/tscircuit_builtin.pretty/${fp.footprintName}.kicad_mod`
        ] = fp.kicadModString
      }
    }

    // Library tables
    fsMap["fp-lib-table"] = generateFpLibTable({
      libraryName: this.ctx.libraryName,
      includeBuiltin:
        this.ctx.includeBuiltins && this.ctx.builtinFootprints.length > 0,
    })
    fsMap["sym-lib-table"] = generateSymLibTable({
      libraryName: this.ctx.libraryName,
      includeBuiltin:
        this.ctx.includeBuiltins && this.ctx.builtinSymbols.length > 0,
    })

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
