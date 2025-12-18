import type { CircuitJson } from "circuit-json"
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
  override _step(): void {
    const pcbContent = this.ctx.pcbContent
    const fpLibraryName = this.ctx.fpLibraryName ?? "tscircuit"

    if (!pcbContent) {
      throw new Error(
        "PCB content not available. Run InitializeLibraryStage first.",
      )
    }

    const uniqueFootprints = new Map<string, FootprintEntry>()

    try {
      const parsed = parseKicadSexpr(pcbContent)
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
        const sanitized = this.sanitizeFootprint(footprint, fpLibraryName)
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
  ): FootprintEntry {
    // Extract footprint name from libraryLink (e.g., "tscircuit:simple_resistor" -> "simple_resistor")
    const libraryLink = footprint.libraryLink ?? "footprint"
    const parts = libraryLink.split(":")
    const footprintName =
      (parts.length > 1 ? parts[1] : parts[0])
        ?.replace(/[\\\/]/g, "-")
        .trim() || "footprint"

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
      content: footprint.getString(),
      modelFiles,
    }
  }

  override getOutput(): KicadLibraryOutput {
    return this.ctx.libraryOutput!
  }
}
