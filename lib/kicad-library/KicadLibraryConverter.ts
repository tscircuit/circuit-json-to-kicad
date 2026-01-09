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
      kicadLibraryName: options.libraryName ?? "tscircuit_library",
      includeBuiltins: options.includeBuiltins ?? true,
    })
  }

  async run(): Promise<void> {
    // Stage 1: Collect circuit JSON from component files
    this.ctx.builtComponents = await this.collectTscircuitComponents()

    // Stage 2: Extract KiCad footprints and symbols from each component
    this.ctx.extractedComponents = this.extractKicadComponents()

    // Stage 3: Classify footprints into user/builtin
    classifyKicadFootprints(this.ctx)

    // Stage 4: Classify symbols into user/builtin
    classifyKicadSymbols(this.ctx)

    // Stage 5: Build output files
    buildKicadLibraryFiles(this.ctx)

    this.output = {
      kicadProjectFsMap: this.ctx.kicadProjectFsMap,
      model3dSourcePaths: this.ctx.model3dSourcePaths,
      libraryName: this.ctx.kicadLibraryName,
    }
  }

  /**
   * Collects circuit JSON from tscircuit component source files.
   */
  private async collectTscircuitComponents(): Promise<
    BuiltTscircuitComponent[]
  > {
    const builtComponents: BuiltTscircuitComponent[] = []
    const { entrypoint } = this.options

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
        builtComponents.push({
          tscircuitComponentName: exportName,
          circuitJson,
        })
      }
    }

    return builtComponents
  }

  /**
   * Extracts KiCad footprints and symbols from built components.
   */
  private extractKicadComponents(): ExtractedKicadComponent[] {
    const extractedComponents: ExtractedKicadComponent[] = []

    for (const builtComponent of this.ctx.builtComponents) {
      const { tscircuitComponentName, circuitJson } = builtComponent

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

      extractedComponents.push({
        tscircuitComponentName,
        kicadFootprints: libOutput.footprints,
        kicadSymbols: libOutput.symbols,
        model3dSourcePaths: libOutput.model3dSourcePaths,
      })
    }

    return extractedComponents
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
}): KicadLibraryConverterContext {
  return {
    kicadLibraryName: params.kicadLibraryName,
    includeBuiltins: params.includeBuiltins,
    builtComponents: [],
    extractedComponents: [],
    userKicadFootprints: [],
    builtinKicadFootprints: [],
    userKicadSymbols: [],
    builtinKicadSymbols: [],
    model3dSourcePaths: [],
    kicadProjectFsMap: {},
  }
}
