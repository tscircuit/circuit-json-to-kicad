import type { CircuitJson } from "circuit-json"
import type { SymbolEntry, FootprintEntry } from "../types"
import type {
  KicadFootprintMetadata,
  KicadSymbolMetadata,
} from "@tscircuit/props"

export interface KicadLibraryConverterOptions {
  /**
   * Name for the generated KiCad library (e.g., "my-library").
   * This will be used for the user library files.
   */
  kicadLibraryName?: string

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

  /**
   * Callback to get KiCad footprint metadata from a component via prop introspection.
   * This allows extracting kicadFootprintMetadata props without rendering the component.
   * Return null if no metadata is available.
   */
  getComponentKicadMetadata?: (
    filePath: string,
    componentName: string,
  ) => Promise<KicadFootprintMetadata | null>

  /**
   * Callback to get KiCad symbol metadata from a component via prop introspection.
   * This allows extracting kicadSymbolMetadata props without rendering the component.
   * Return null if no metadata is available.
   */
  getComponentKicadSymbolMetadata?: (
    filePath: string,
    componentName: string,
  ) => Promise<KicadSymbolMetadata | null>
}

export interface KicadLibraryConverterOutput {
  /**
   * Map of file paths to file contents for the generated KiCad library.
   */
  kicadProjectFsMap: Record<string, string | Buffer>

  /**
   * Source paths to 3D model files that need to be copied.
   */
  model3dSourcePaths: string[]
}

/**
 * A component that has been built to circuit JSON.
 */
export interface BuiltTscircuitComponent {
  tscircuitComponentName: string
  circuitJson: CircuitJson
}

/**
 * A component with its extracted KiCad footprints and symbols.
 */
export interface ExtractedKicadComponent {
  tscircuitComponentName: string
  kicadFootprints: FootprintEntry[]
  kicadSymbols: SymbolEntry[]
  model3dSourcePaths: string[]
}

/**
 * Context for the KiCad library converter stages.
 */
export interface KicadLibraryConverterContext {
  kicadLibraryName: string
  includeBuiltins: boolean

  /** Callback to get KiCad footprint metadata from component props */
  getComponentKicadMetadata?: (
    filePath: string,
    componentName: string,
  ) => Promise<KicadFootprintMetadata | null>

  /** Callback to get KiCad symbol metadata from component props */
  getComponentKicadSymbolMetadata?: (
    filePath: string,
    componentName: string,
  ) => Promise<KicadSymbolMetadata | null>

  /** Map of footprint name to its KiCad metadata from component props */
  footprintMetadataMap: Map<string, KicadFootprintMetadata>

  /** Map of symbol name to its KiCad metadata from component props */
  symbolMetadataMap: Map<string, KicadSymbolMetadata>

  /** Tscircuit components built to circuit-json */
  builtTscircuitComponents: BuiltTscircuitComponent[]

  /** KiCad footprints and symbols extracted from circuit-json */
  extractedKicadComponents: ExtractedKicadComponent[]

  /** User-defined footprints (custom footprint={<footprint>...}) */
  userKicadFootprints: FootprintEntry[]

  /** Builtin footprints (from footprinter like 0402, soic8) */
  builtinKicadFootprints: FootprintEntry[]

  /** User-defined symbols (custom symbol={<symbol>...} or renamed for custom footprint) */
  userKicadSymbols: SymbolEntry[]

  /** Builtin symbols (from schematic-symbols package) */
  builtinKicadSymbols: SymbolEntry[]

  /** 3D model source paths to copy */
  model3dSourcePaths: string[]

  /** Final output file map */
  kicadProjectFsMap: Record<string, string | Buffer>
}
