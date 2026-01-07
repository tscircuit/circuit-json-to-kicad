import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadLibraryConverter } from "./CircuitJsonToKicadLibraryConverter"

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
 *
 * @example
 * ```tsx
 * const converter = new KicadLibraryConverter({
 *   libraryName: "my-library",
 *   filePaths: ["lib/my-footprint-library.ts"],
 *   buildFileToCircuitJson: async (filePath) => {
 *     return await generateCircuitJson(filePath)
 *   },
 *   getExportsFromTsxFile: async (filePath) => {
 *     return Object.keys(await import(filePath))
 *   },
 *   resolveExportPath: async (entrypoint, exportName) => {
 *     // Return the file path for the export, or null if not a component
 *     return `lib/components/${exportName}.tsx`
 *   }
 * })
 *
 * await converter.run()
 * const output = converter.getOutput()
 * // output.kicadProjectFsMap contains all generated files
 * ```
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

    const allFootprints: Array<{
      footprintName: string
      kicadModString: string
    }> = []
    const allModel3dPaths: string[] = []
    let kicadSymString = ""
    let fpLibTableString = ""
    let symLibTableString = ""

    // Process each entrypoint file
    for (const entrypoint of this.options.filePaths) {
      // Get all exports from the entrypoint by evaluating it
      const exports = await this.options.getExportsFromTsxFile(entrypoint)

      // Filter to only uppercase exports (likely components)
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

          if (!circuitJson || (Array.isArray(circuitJson) && circuitJson.length === 0)) {
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

          // Collect footprints (avoid duplicates by name)
          for (const fp of libOutput.footprints) {
            if (!allFootprints.some((f) => f.footprintName === fp.footprintName)) {
              allFootprints.push(fp)
            }
          }

          // Collect 3D model paths
          for (const modelPath of libOutput.model3dSourcePaths) {
            if (!allModel3dPaths.includes(modelPath)) {
              allModel3dPaths.push(modelPath)
            }
          }

          // Keep track of symbol and table strings
          kicadSymString = libOutput.kicadSymString
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

    // Symbol library
    if (kicadSymString) {
      kicadProjectFsMap[`${libraryName}.kicad_sym`] = kicadSymString
    }

    // Footprint files
    for (const fp of allFootprints) {
      kicadProjectFsMap[`${libraryName}.pretty/${fp.footprintName}.kicad_mod`] =
        fp.kicadModString
    }

    // Library tables
    if (fpLibTableString) {
      kicadProjectFsMap["fp-lib-table"] = fpLibTableString
    }
    if (symLibTableString) {
      kicadProjectFsMap["sym-lib-table"] = symLibTableString
    }

    // Note: 3D model files would need to be copied from source paths
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
