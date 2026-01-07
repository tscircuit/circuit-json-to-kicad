import type { CircuitJson } from "circuit-json"
import { KicadSymbolLib } from "kicadts"
import { CircuitJsonToKicadLibraryConverter } from "./CircuitJsonToKicadLibraryConverter"
import type { SymbolEntry } from "../types"

const KICAD_SYM_LIB_VERSION = 20211014
const GENERATOR = "circuit-json-to-kicad"

export interface KicadLibraryConverterOptions {
  /**
   * Name for the generated library
   */
  libraryName: string

  /**
   * Entry point file paths to process (e.g., "lib/my-footprint-library.ts")
   */
  filePaths: string[]

  /**
   * Callback to build circuit JSON from a component file path.
   * This is called for each component that needs to be converted.
   */
  buildFileToCircuitJson: (filePath: string) => Promise<CircuitJson>

  /**
   * Callback to get all exports from a TSX/TS file by evaluating it.
   * DO NOT parse TSX to get exports - use evaluation instead.
   * This is required to handle `export * from "./..."` patterns correctly.
   */
  getExportsFromTsxFile: (filePath: string) => Promise<string[]>

  /**
   * Callback to resolve an export name to its source file path.
   * Returns null if the export is not a component (e.g., string, type, helper function).
   */
  resolveExportPath: (
    entrypoint: string,
    exportName: string,
  ) => Promise<string | null>

  /**
   * Whether to include builtin footprints (like 0402, soic8) in the output.
   * If false, only user-defined footprints (matching export names) are included.
   * Default: true
   */
  includeBuiltins?: boolean
}

export interface KicadLibraryConverterOutput {
  /**
   * Map of file paths to file contents for the generated KiCad library.
   * Includes .kicad_sym, .kicad_mod files, library tables, and 3D models.
   */
  kicadProjectFsMap: Record<string, string | Buffer>
}

/**
 * Converts tscircuit component files to a KiCad library.
 *
 * This converter takes file paths and callbacks to build circuit JSON,
 * then generates a complete KiCad library structure.
 */
export class KicadLibraryConverter {
  private options: KicadLibraryConverterOptions
  private output: KicadLibraryConverterOutput | null = null

  constructor(options: KicadLibraryConverterOptions) {
    this.options = options
  }

  /**
   * Run the converter to process all files and generate the KiCad library.
   */
  async run(): Promise<void> {
    const kicadProjectFsMap: Record<string, string | Buffer> = {}

    // Track all export names to distinguish user vs builtin footprints/symbols
    const allExportNames: Set<string> = new Set()

    // User footprints (named after exports)
    const userFootprints: Array<{
      footprintName: string
      kicadModString: string
    }> = []

    // Builtin footprints (standard footprints like 0402, soic8)
    const builtinFootprints: Array<{
      footprintName: string
      kicadModString: string
    }> = []

    // User symbols (named after exports)
    const userSymbols: SymbolEntry[] = []

    // Builtin symbols (standard parts like resistors, capacitors)
    const builtinSymbols: SymbolEntry[] = []

    const allModel3dPaths: string[] = []
    let fpLibTableString = ""
    let symLibTableString = ""

    // First pass: collect all export names
    for (const entrypoint of this.options.filePaths) {
      // Get all exports from the entrypoint by evaluating it
      const exports = await this.options.getExportsFromTsxFile(entrypoint)

      // Filter to only uppercase exports (likely components)
      const componentExports = exports.filter(
        (name) => name.length > 0 && /^[A-Z]/.test(name),
      )
      for (const exportName of componentExports) {
        allExportNames.add(exportName)
      }
    }

    // Second pass: process each entrypoint file
    for (const entrypoint of this.options.filePaths) {
      const exports = await this.options.getExportsFromTsxFile(entrypoint)
      const componentExports = exports.filter(
        (name) => name.length > 0 && /^[A-Z]/.test(name),
      )

      // Process each component export
      for (const exportName of componentExports) {
        // Resolve the export to its source file path
        const componentPath = await this.options.resolveExportPath(
          entrypoint,
          exportName,
        )

        if (!componentPath) {
          // Not a component, skip
          continue
        }

        try {
          // Build circuit JSON for this component
          const circuitJson =
            await this.options.buildFileToCircuitJson(componentPath)

          if (
            !circuitJson ||
            (Array.isArray(circuitJson) && circuitJson.length === 0)
          ) {
            continue
          }

          // Convert circuit JSON to KiCad library format
          const libConverter = new CircuitJsonToKicadLibraryConverter(
            circuitJson,
            {
              libraryName: this.options.libraryName,
              footprintLibraryName: this.options.libraryName,
            },
          )
          libConverter.runUntilFinished()
          const libOutput = libConverter.getOutput()

          // Separate footprints into user vs builtin
          for (const fp of libOutput.footprints) {
            // If footprint name matches an export name, it's a user footprint
            if (allExportNames.has(fp.footprintName)) {
              if (
                !userFootprints.some(
                  (f) => f.footprintName === fp.footprintName,
                )
              ) {
                userFootprints.push(fp)
              }
            } else {
              // Otherwise it's a builtin footprint (standard parts like 0402, soic8)
              if (
                !builtinFootprints.some(
                  (f) => f.footprintName === fp.footprintName,
                )
              ) {
                builtinFootprints.push(fp)
              }
            }
          }

          // Separate symbols into user vs builtin
          for (const sym of libOutput.symbols) {
            // If symbol name matches an export name, it's a user symbol
            if (allExportNames.has(sym.symbolName)) {
              if (!userSymbols.some((s) => s.symbolName === sym.symbolName)) {
                userSymbols.push(sym)
              }
            } else {
              // Otherwise it's a builtin symbol (standard parts like resistors)
              if (
                !builtinSymbols.some((s) => s.symbolName === sym.symbolName)
              ) {
                builtinSymbols.push(sym)
              }
            }
          }

          // Collect 3D model paths
          for (const modelPath of libOutput.model3dSourcePaths) {
            if (!allModel3dPaths.includes(modelPath)) {
              allModel3dPaths.push(modelPath)
            }
          }

          // Keep track of table strings
          fpLibTableString = libOutput.fpLibTableString
          symLibTableString = libOutput.symLibTableString
        } catch (error) {
          // Skip components that fail to build
          console.warn(`Failed to build component ${exportName}:`, error)
        }
      }
    }

    // Build the output file map
    const libraryName = this.options.libraryName
    const includeBuiltins = this.options.includeBuiltins ?? true

    // User symbol library (in symbols/ directory)
    if (userSymbols.length > 0) {
      const userSymbolLib = new KicadSymbolLib({
        version: KICAD_SYM_LIB_VERSION,
        generator: GENERATOR,
        symbols: userSymbols.map((s) => s.symbol),
      })
      kicadProjectFsMap[`symbols/${libraryName}.kicad_sym`] =
        userSymbolLib.getString()
    }

    // Builtin symbol library - only generate if enabled and there are builtins
    if (includeBuiltins && builtinSymbols.length > 0) {
      const builtinSymbolLib = new KicadSymbolLib({
        version: KICAD_SYM_LIB_VERSION,
        generator: GENERATOR,
        symbols: builtinSymbols.map((s) => s.symbol),
      })
      kicadProjectFsMap["symbols/tscircuit_builtin.kicad_sym"] =
        builtinSymbolLib.getString()
    }

    // User footprint files (in footprints/<lib>.pretty/ directory)
    for (const fp of userFootprints) {
      kicadProjectFsMap[
        `footprints/${libraryName}.pretty/${fp.footprintName}.kicad_mod`
      ] = fp.kicadModString
    }

    // Builtin footprint files - only generate if enabled and there are builtins
    if (includeBuiltins && builtinFootprints.length > 0) {
      for (const fp of builtinFootprints) {
        kicadProjectFsMap[
          `footprints/tscircuit_builtin.pretty/${fp.footprintName}.kicad_mod`
        ] = fp.kicadModString
      }
    }

    // Library tables
    if (fpLibTableString) {
      kicadProjectFsMap["fp-lib-table"] = fpLibTableString
    }
    if (symLibTableString) {
      kicadProjectFsMap["sym-lib-table"] = symLibTableString
    }

    // Note: 3D model files would be in 3dmodels/<lib>.3dshapes/
    // This is handled by the CLI since it has access to the filesystem

    this.output = { kicadProjectFsMap }
  }

  /**
   * Get the converter output after running.
   * @throws Error if run() has not been called yet
   */
  getOutput(): KicadLibraryConverterOutput {
    if (!this.output) {
      throw new Error(
        "Converter has not been run yet. Call run() before getOutput().",
      )
    }
    return this.output
  }
}
