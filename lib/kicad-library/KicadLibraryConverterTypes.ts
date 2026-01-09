import type { CircuitJson } from "circuit-json"

export interface KicadLibraryConverterOptions {
  /**
   * Name for the generated library (e.g., "my-library").
   * This will be used for the user library files.
   */
  libraryName?: string

  /**
   * The main entry point file for the library (e.g., "lib/my-library.ts").
   * This file's exports define the public API of the library.
   */
  entrypoint: string

  /**
   * Callback to build circuit JSON from a file path and export name.
   * Should handle both board components and symbol components:
   * - For board components: render inside a <board> element
   * - For symbol components: render inside a <chip> with the symbol prop
   *   (Note: tscircuit symbols cannot render standalone - they must be
   *   used as a prop on a <chip> component)
   * Return null if the export cannot be rendered.
   */
  buildFileToCircuitJson: (
    filePath: string,
    componentName: string,
  ) => Promise<CircuitJson | null>

  /**
   * Callback to get all exports from a TSX/TS file.
   * Must evaluate the file (not just parse) to handle `export * from` patterns.
   */
  getExportsFromTsxFile: (filePath: string) => Promise<string[]>

  /**
   * Callback to resolve an export name to its file path.
   * Returns the file path where the component is defined, or null if not resolvable.
   */
  resolveExportPath?: (
    entrypoint: string,
    exportName: string,
  ) => Promise<string | null>

  /**
   * Whether to include builtin footprints/symbols (like 0402, soic8).
   * Default: true
   */
  includeBuiltins?: boolean
}

export interface KicadLibraryConverterOutput {
  /**
   * Map of file paths to file contents for the generated KiCad library.
   * Structure:
   * - fp-lib-table
   * - sym-lib-table
   * - symbols/<libraryName>.kicad_sym
   * - symbols/tscircuit_builtin.kicad_sym
   * - footprints/<libraryName>.pretty/<ComponentName>.kicad_mod
   * - footprints/tscircuit_builtin.pretty/<footprint>.kicad_mod
   */
  kicadProjectFsMap: Record<string, string | Buffer>

  /**
   * Source paths to 3D model files that need to be copied.
   * The CLI should copy these files to 3dmodels/<libraryName>.3dshapes/
   */
  model3dSourcePaths: string[]

  /**
   * Library name used for the output.
   */
  libraryName: string
}
