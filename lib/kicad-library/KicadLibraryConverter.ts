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
import { renameKicadSymbol } from "./kicad-library-converter-utils/renameKicadSymbol"
import { updateKicadSymbolFootprint } from "./kicad-library-converter-utils/updateKicadSymbolFootprint"

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
    const { entrypoint } = this.options

    // Only process exports from the entrypoint - this defines the library's public API
    const exports = await this.options.getExportsFromTsxFile(entrypoint)
    const componentExports = exports.filter((name) => /^[A-Z]/.test(name))

    for (const exportName of componentExports) {
      let componentPath = entrypoint
      if (this.options.resolveExportPath) {
        const resolved = await this.options.resolveExportPath(
          entrypoint,
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

      const hasCustomFootprint = this.processFootprints(
        libOutput.footprints,
        componentName,
      )
      this.processSymbols(libOutput.symbols, componentName, hasCustomFootprint)

      for (const path of libOutput.model3dSourcePaths) {
        if (!this.ctx.model3dPaths.includes(path)) {
          this.ctx.model3dPaths.push(path)
        }
      }
    }
  }

  /**
   * Process footprints: custom → user library, builtin → builtin library.
   * Custom = user specified footprint={<footprint>...</footprint>}
   * Returns true if component has custom footprint.
   */
  private processFootprints(
    footprints: FootprintEntry[],
    componentName: string,
  ): boolean {
    let hasCustomFootprint = false

    for (const fp of footprints) {
      if (fp.isBuiltin) {
        // Builtin footprint → builtin library
        if (
          !this.ctx.builtinFootprints.some(
            (f) => f.footprintName === fp.footprintName,
          )
        ) {
          this.ctx.builtinFootprints.push(fp)
        }
      } else {
        // Custom footprint → user library, rename first one to component name
        if (!hasCustomFootprint) {
          hasCustomFootprint = true
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
    }

    return hasCustomFootprint
  }

  /**
   * Process symbols based on custom footprint/symbol status.
   * - Custom symbol (symbol={<symbol>...}) → user library
   * - Custom footprint + builtin symbol → rename symbol to component name, user library
   * - No custom footprint → builtin library
   */
  private processSymbols(
    symbols: SymbolEntry[],
    componentName: string,
    hasCustomFootprint: boolean,
  ): void {
    let addedUserSymbol = false

    for (const sym of symbols) {
      if (!sym.isBuiltin) {
        // Custom symbol → user library
        if (!addedUserSymbol) {
          addedUserSymbol = true
          const renamedSym = renameKicadSymbol({
            kicadSymbol: sym,
            newKicadSymbolName: componentName,
          })
          if (hasCustomFootprint) {
            updateKicadSymbolFootprint({
              kicadSymbol: renamedSym,
              kicadLibraryName: this.ctx.libraryName,
              kicadFootprintName: componentName,
            })
          }
          if (
            !this.ctx.userSymbols.some((s) => s.symbolName === componentName)
          ) {
            this.ctx.userSymbols.push(renamedSym)
          }
        } else if (
          !this.ctx.userSymbols.some((s) => s.symbolName === sym.symbolName)
        ) {
          this.ctx.userSymbols.push(sym)
        }
      } else if (hasCustomFootprint && !addedUserSymbol) {
        // Builtin symbol but has custom footprint → rename and add to user library
        // This allows user to place the component by name in KiCad
        addedUserSymbol = true
        const renamedSym = renameKicadSymbol({
          kicadSymbol: sym,
          newKicadSymbolName: componentName,
        })
        updateKicadSymbolFootprint({
          kicadSymbol: renamedSym,
          kicadLibraryName: this.ctx.libraryName,
          kicadFootprintName: componentName,
        })
        if (!this.ctx.userSymbols.some((s) => s.symbolName === componentName)) {
          this.ctx.userSymbols.push(renamedSym)
        }
      } else {
        // Builtin symbol, no custom footprint → builtin library
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
