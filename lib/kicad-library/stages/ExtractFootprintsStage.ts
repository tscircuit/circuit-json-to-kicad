import type { CircuitJson, CadComponent } from "circuit-json"
import {
  parseKicadSexpr,
  KicadPcb,
  Footprint,
  FootprintModel,
  At,
} from "kicadts"
import {
  ConverterStage,
  type ConverterContext,
  type KicadLibraryOutput,
  type FootprintEntry,
} from "../../types"

/**
 * Browser-compatible basename extraction (handles both / and \ separators)
 */
function getBasename(filePath: string): string {
  const parts = filePath.split(/[/\\]/)
  return parts[parts.length - 1] || filePath
}

/**
 * Extracts footprints from the generated PCB content.
 */
export class ExtractFootprintsStage extends ConverterStage<
  CircuitJson,
  KicadLibraryOutput
> {
  /**
   * Build a set of footprint names that are builtin (have footprinter_string).
   * Footprints with footprinter_string are standard library footprints like "0402".
   * Footprints without footprinter_string are custom inline footprints.
   */
  private buildBuiltinFootprintNames(): Set<string> {
    const builtinNames = new Set<string>()

    // Get all cad_components from circuit JSON
    const cadComponents = this.ctx.db.cad_component?.list() ?? []

    for (const cadComponent of cadComponents as CadComponent[]) {
      // If the cad_component has a footprinter_string, this is a builtin footprint
      if (cadComponent.footprinter_string) {
        // The footprint name is typically: {type}_{footprinter_string}
        // But we need to match it with the actual footprint name used in the PCB
        // We can track it by footprinter_string itself
        builtinNames.add(cadComponent.footprinter_string)
      }
    }

    return builtinNames
  }

  /**
   * Checks if a footprint name indicates it's a builtin footprint.
   * A footprint is builtin if it contains a footprinter_string (like "0402", "soic8").
   */
  private isBuiltinFootprint(
    footprintName: string,
    builtinFootprinterStrings: Set<string>,
  ): boolean {
    // Check if the footprint name contains any of the footprinter_strings
    // e.g., "resistor_0402" contains "0402", "chip_soic8" contains "soic8"
    for (const fps of builtinFootprinterStrings) {
      if (footprintName.includes(fps)) {
        return true
      }
    }
    return false
  }

  override _step(): void {
    const kicadPcbString = this.ctx.kicadPcbString
    const fpLibraryName = this.ctx.fpLibraryName ?? "tscircuit"

    if (!kicadPcbString) {
      throw new Error(
        "PCB content not available. Run GenerateKicadSchAndPcbStage first.",
      )
    }

    // Build set of builtin footprinter_strings from circuit JSON
    const builtinFootprinterStrings = this.buildBuiltinFootprintNames()

    const uniqueFootprints = new Map<string, FootprintEntry>()

    try {
      const parsed = parseKicadSexpr(kicadPcbString)
      const pcb = parsed.find(
        (node): node is KicadPcb => node instanceof KicadPcb,
      )
      if (!pcb) {
        this.ctx.footprintEntries = []
        this.finished = true
        return
      }

      const footprints = pcb.footprints ?? []
      for (const footprint of footprints) {
        const sanitized = this.sanitizeFootprint(
          footprint,
          fpLibraryName,
          builtinFootprinterStrings,
        )
        if (!uniqueFootprints.has(sanitized.footprintName)) {
          uniqueFootprints.set(sanitized.footprintName, sanitized)
        }
      }
    } catch (error) {
      console.warn("Failed to parse PCB for footprint extraction:", error)
    }

    this.ctx.footprintEntries = Array.from(uniqueFootprints.values())
    this.finished = true
  }

  private sanitizeFootprint(
    footprint: Footprint,
    fpLibraryName: string,
    builtinFootprinterStrings: Set<string>,
  ): FootprintEntry {
    // Extract footprint name from libraryLink (e.g., "tscircuit:simple_resistor" -> "simple_resistor")
    const libraryLink = footprint.libraryLink ?? "footprint"
    const parts = libraryLink.split(":")
    const footprintName =
      (parts.length > 1 ? parts[1] : parts[0])
        ?.replace(/[\\\/]/g, "-")
        .trim() || "footprint"

    // Determine if this is a builtin footprint based on footprinter_string data
    const isBuiltin = this.isBuiltinFootprint(
      footprintName,
      builtinFootprinterStrings,
    )

    // Reset footprint for library use
    footprint.libraryLink = footprintName
    footprint.position = At.from([0, 0, 0])
    footprint.locked = false
    footprint.placed = false
    footprint.uuid = undefined
    footprint.path = undefined
    footprint.sheetfile = undefined
    footprint.sheetname = undefined
    footprint.properties = []

    // Clean up texts
    const texts = footprint.fpTexts ?? []
    for (const text of texts) {
      text.uuid = undefined
      if (text.type === "reference") {
        text.text = "REF**"
      } else if (text.type === "value" && text.text.trim().length === 0) {
        text.text = footprintName
      }
    }
    footprint.fpTexts = texts

    // Clean up pads
    const pads = footprint.fpPads ?? []
    for (const pad of pads) {
      pad.uuid = undefined
      pad.net = undefined
    }
    footprint.fpPads = pads

    // Handle 3D models - update paths and collect original files
    const models = footprint.models ?? []
    const updatedModels: FootprintModel[] = []
    const modelFiles: string[] = []

    for (const model of models) {
      if (model.path) {
        const modelFilename = getBasename(model.path)
        const newPath = `\${KIPRJMOD}/${fpLibraryName}.3dshapes/${modelFilename}`

        const newModel = new FootprintModel(newPath)
        if (model.offset) newModel.offset = model.offset
        if (model.scale) newModel.scale = model.scale
        if (model.rotate) newModel.rotate = model.rotate

        updatedModels.push(newModel)
        modelFiles.push(model.path)
      }
    }
    footprint.models = updatedModels

    return {
      footprintName,
      kicadModString: footprint.getString(),
      model3dSourcePaths: modelFiles,
      isBuiltin,
    }
  }

  override getOutput(): KicadLibraryOutput {
    return this.ctx.libraryOutput!
  }
}
