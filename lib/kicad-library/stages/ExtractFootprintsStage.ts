import type {
  CircuitJson,
  CadComponent,
  SourceComponentBase,
} from "circuit-json"
import {
  parseKicadSexpr,
  KicadPcb,
  Footprint,
  FootprintModel,
  At,
  EmbeddedFonts,
  FootprintAttr,
  Property,
  TextEffects,
  TextEffectsFont,
} from "kicadts"
import {
  ConverterStage,
  type ConverterContext,
  type KicadLibraryOutput,
  type FootprintEntry,
} from "../../types"
import { getKicadCompatibleComponentName } from "../../utils/getKicadCompatibleComponentName"

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
   * Builds a set of custom footprint names.
   * These are components WITHOUT footprinter_string.
   */
  private findCustomFootprintNames(): Set<string> {
    const customNames = new Set<string>()

    const cadComponents = this.ctx.db.cad_component?.list() ?? []
    const sourceComponents = this.ctx.db.source_component

    for (const cadComponent of cadComponents as CadComponent[]) {
      // No footprinter_string = custom inline footprint
      if (!cadComponent.footprinter_string) {
        const sourceComp = cadComponent.source_component_id
          ? sourceComponents?.get(cadComponent.source_component_id)
          : null

        if (sourceComp) {
          const footprintName = getKicadCompatibleComponentName(
            sourceComp as SourceComponentBase,
            cadComponent,
          )
          customNames.add(footprintName)
        }
      }
    }

    return customNames
  }

  override _step(): void {
    const kicadPcbString = this.ctx.kicadPcbString
    const fpLibraryName = this.ctx.fpLibraryName ?? "tscircuit"

    if (!kicadPcbString) {
      throw new Error(
        "PCB content not available. Run GenerateKicadSchAndPcbStage first.",
      )
    }

    // Find custom footprint names (components without footprinter_string)
    const customFootprintNames = this.findCustomFootprintNames()

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
        const footprintEntry = this.sanitizeFootprint({
          footprint,
          fpLibraryName,
          customFootprintNames,
        })
        if (!uniqueFootprints.has(footprintEntry.footprintName)) {
          uniqueFootprints.set(footprintEntry.footprintName, footprintEntry)
        }
      }
    } catch (error) {
      console.warn("Failed to parse PCB for footprint extraction:", error)
    }

    this.ctx.footprintEntries = Array.from(uniqueFootprints.values())
    this.finished = true
  }

  private sanitizeFootprint({
    footprint,
    fpLibraryName,
    customFootprintNames,
  }: {
    footprint: Footprint
    fpLibraryName: string
    customFootprintNames: Set<string>
  }): FootprintEntry {
    // Extract footprint name from libraryLink (e.g., "tscircuit:simple_resistor" -> "simple_resistor")
    const libraryLink = footprint.libraryLink ?? "footprint"
    const parts = libraryLink.split(":")
    const footprintName =
      (parts.length > 1 ? parts[1] : parts[0])
        ?.replace(/[\\\/]/g, "-")
        .trim() || "footprint"

    // Custom footprints are in customFootprintNames set, everything else is builtin
    const isBuiltin = !customFootprintNames.has(footprintName)

    // Reset footprint for library use
    footprint.libraryLink = footprintName
    footprint.position = At.from([0, 0, 0])
    footprint.locked = false
    footprint.placed = false
    if (!footprint.descr) {
      footprint.descr = ""
    }
    if (!footprint.tags) {
      footprint.tags = ""
    }
    if (!footprint.embeddedFonts) {
      footprint.embeddedFonts = new EmbeddedFonts(false)
    }
    if (!footprint.attr) {
      const attr = new FootprintAttr()
      const padTypes = (footprint.fpPads ?? []).map((pad) => pad.padType)
      if (padTypes.some((padType) => padType.includes("thru_hole"))) {
        attr.type = "through_hole"
      } else if (padTypes.some((padType) => padType.includes("smd"))) {
        attr.type = "smd"
      }
      footprint.attr = attr
    }
    footprint.uuid = undefined
    footprint.path = undefined
    footprint.sheetfile = undefined
    footprint.sheetname = undefined
    const defaultFont = new TextEffectsFont()
    defaultFont.size = { width: 1.27, height: 1.27 }
    defaultFont.thickness = 0.15
    const defaultEffects = new TextEffects({ font: defaultFont })
    footprint.properties = [
      new Property({
        key: "Reference",
        value: "Ref**",
        position: [0, 0, 0],
        layer: "F.SilkS",
        effects: defaultEffects,
      }),
      new Property({
        key: "Value",
        value: "Val**",
        position: [0, 0, 0],
        layer: "F.Fab",
        effects: defaultEffects,
      }),
      new Property({
        key: "Datasheet",
        value: "",
        position: [0, 0, 0],
        layer: "F.Fab",
        hidden: true,
        effects: defaultEffects,
      }),
      new Property({
        key: "Description",
        value: "",
        position: [0, 0, 0],
        layer: "F.Fab",
        hidden: true,
        effects: defaultEffects,
      }),
    ]

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
