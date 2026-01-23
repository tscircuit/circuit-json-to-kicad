import { CircuitJsonToKicadLibraryConverter } from "./CircuitJsonToKicadLibraryConverter"
import type {
  KicadLibraryConverterOptions,
  KicadLibraryConverterOutput,
  KicadLibraryConverterContext,
  BuiltTscircuitComponent,
  ExtractedKicadComponent,
} from "./KicadLibraryConverterTypes"
import { classifyKicadFootprints } from "./stages/ClassifyKicadFootprintsStage"
import { classifyKicadSymbols } from "./stages/ClassifyKicadSymbolsStage"
import { buildKicadLibraryFiles } from "./stages/BuildKicadLibraryFilesStage"

export type { KicadLibraryConverterOptions, KicadLibraryConverterOutput }
import type { KicadFootprintMetadata } from "@tscircuit/props"

/**
 * Converts tscircuit component files to a KiCad library.
 */
export class KicadLibraryConverter {
  private options: KicadLibraryConverterOptions
  private output: KicadLibraryConverterOutput | null = null
  private ctx: KicadLibraryConverterContext

  constructor(options: KicadLibraryConverterOptions) {
    this.options = options
    this.ctx = createKicadLibraryConverterContext({
      kicadLibraryName: options.kicadLibraryName ?? "tscircuit_library",
      includeBuiltins: options.includeBuiltins ?? true,
      getComponentKicadMetadata: options.getComponentKicadMetadata,
      isPcm: options.isPcm ?? false,
      kicadPcmPackageId: options.kicadPcmPackageId,
    })
  }

  async run(): Promise<void> {
    // Stage 1: Build tscircuit components to circuit-json
    this.ctx.builtTscircuitComponents = await this.buildTscircuitComponents()

    // Stage 2: Extract KiCad footprints and symbols from circuit-json
    this.ctx.extractedKicadComponents = this.extractKicadComponents()

    // Stage 3: Classify footprints into user/builtin
    classifyKicadFootprints(this.ctx)

    // Stage 4: Classify symbols into user/builtin
    classifyKicadSymbols(this.ctx)

    // Stage 5: Build output files
    buildKicadLibraryFiles(this.ctx)

    this.output = {
      kicadProjectFsMap: this.ctx.kicadProjectFsMap,
      model3dSourcePaths: this.ctx.model3dSourcePaths,
    }
  }

  /**
   * Builds tscircuit components to circuit-json.
   */
  private async buildTscircuitComponents(): Promise<BuiltTscircuitComponent[]> {
    const builtTscircuitComponents: BuiltTscircuitComponent[] = []
    const { entrypoint } = this.options

    const exports = await this.options.getExportsFromTsxFile(entrypoint)

    // Named exports starting with uppercase
    const namedExports = exports.filter(
      (name) => name !== "default" && /^[A-Z]/.test(name),
    )

    // Process named exports
    for (const exportName of namedExports) {
      let componentPath = entrypoint
      if (this.options.resolveExportPath) {
        const resolved = await this.options.resolveExportPath(
          entrypoint,
          exportName,
        )
        if (resolved) componentPath = resolved
      }

      // Fetch kicadFootprintMetadata via prop introspection
      if (this.ctx.getComponentKicadMetadata) {
        const metadata = await this.ctx.getComponentKicadMetadata(
          componentPath,
          exportName,
        )
        if (metadata) {
          this.ctx.footprintMetadataMap.set(exportName, metadata)
        }
      }

      const circuitJson = await this.options.buildFileToCircuitJson(
        componentPath,
        exportName,
      )
      if (
        circuitJson &&
        (!Array.isArray(circuitJson) || circuitJson.length > 0)
      ) {
        builtTscircuitComponents.push({
          tscircuitComponentName: exportName,
          circuitJson,
        })
      }
    }

    // Handle default export - resolve path and derive name from resolved file
    if (exports.includes("default")) {
      let componentPath = entrypoint
      if (this.options.resolveExportPath) {
        const resolved = await this.options.resolveExportPath(
          entrypoint,
          "default",
        )
        if (resolved) componentPath = resolved
      }

      const componentName = deriveComponentNameFromPath(componentPath)

      // Fetch kicadFootprintMetadata via prop introspection
      if (this.ctx.getComponentKicadMetadata) {
        const metadata = await this.ctx.getComponentKicadMetadata(
          componentPath,
          "default",
        )
        if (metadata) {
          this.ctx.footprintMetadataMap.set(componentName, metadata)
        }
      }

      const circuitJson = await this.options.buildFileToCircuitJson(
        componentPath,
        "default",
      )
      if (
        circuitJson &&
        (!Array.isArray(circuitJson) || circuitJson.length > 0)
      ) {
        builtTscircuitComponents.push({
          tscircuitComponentName: componentName,
          circuitJson,
        })
      }
    }

    return builtTscircuitComponents
  }

  /**
   * Extracts KiCad footprints and symbols from built tscircuit components.
   */
  private extractKicadComponents(): ExtractedKicadComponent[] {
    const extractedKicadComponents: ExtractedKicadComponent[] = []

    for (const builtTscircuitComponent of this.ctx.builtTscircuitComponents) {
      const { tscircuitComponentName, circuitJson } = builtTscircuitComponent

      const libConverter = new CircuitJsonToKicadLibraryConverter(circuitJson, {
        libraryName: this.ctx.kicadLibraryName,
        footprintLibraryName: this.ctx.kicadLibraryName,
      })
      libConverter.runUntilFinished()
      const libOutput = libConverter.getOutput()

      // Collect 3D model paths
      for (const path of libOutput.model3dSourcePaths) {
        if (!this.ctx.model3dSourcePaths.includes(path)) {
          this.ctx.model3dSourcePaths.push(path)
        }
      }

      extractedKicadComponents.push({
        tscircuitComponentName,
        kicadFootprints: libOutput.footprints,
        kicadSymbols: libOutput.symbols,
        model3dSourcePaths: libOutput.model3dSourcePaths,
      })
    }

    return extractedKicadComponents
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

/**
 * Creates an initialized context for the KiCad library converter.
 */
function createKicadLibraryConverterContext(params: {
  kicadLibraryName: string
  includeBuiltins: boolean
  getComponentKicadMetadata?: (
    filePath: string,
    componentName: string,
  ) => Promise<KicadFootprintMetadata | null>
  isPcm: boolean
  kicadPcmPackageId?: string
}): KicadLibraryConverterContext {
  return {
    kicadLibraryName: params.kicadLibraryName,
    includeBuiltins: params.includeBuiltins,
    getComponentKicadMetadata: params.getComponentKicadMetadata,
    isPcm: params.isPcm,
    kicadPcmPackageId: params.kicadPcmPackageId,
    footprintMetadataMap: new Map(),
    builtTscircuitComponents: [],
    extractedKicadComponents: [],
    userKicadFootprints: [],
    builtinKicadFootprints: [],
    userKicadSymbols: [],
    builtinKicadSymbols: [],
    model3dSourcePaths: [],
    kicadProjectFsMap: {},
  }
}

/**
 * Derives a component name from a file path.
 * e.g., "lib/my-circuit.tsx" -> "my-circuit"
 */
function deriveComponentNameFromPath(filePath: string): string {
  const filename = filePath.split(/[/\\]/).pop() || filePath
  return filename.replace(/\.(tsx?|jsx?)$/, "")
}
