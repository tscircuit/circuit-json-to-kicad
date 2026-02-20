import type {
  CircuitJson,
  CadComponent,
  PcbComponent,
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
import { generateDeterministicUuid } from "../../pcb/stages/utils/generateDeterministicUuid"

// KiCad footprint version and generator info
const KICAD_FP_VERSION = 20240108
const KICAD_FP_GENERATOR = "pcbnew"
const KICAD_FP_GENERATOR_VERSION = "8.0"

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
   * Builds a map of component reference designators by footprint name.
   * This preserves the original component names (R1, C1, etc.) from circuit JSON.
   */
  private buildComponentReferenceMap(): Map<
    string,
    { name: string; footprintName: string }
  > {
    const referenceMap = new Map<
      string,
      { name: string; footprintName: string }
    >()

    const cadComponents = this.ctx.db.cad_component?.list() ?? []
    const sourceComponents = this.ctx.db.source_component

    for (const cadComponent of cadComponents as CadComponent[]) {
      const sourceComp = cadComponent.source_component_id
        ? sourceComponents?.get(cadComponent.source_component_id)
        : null

      if (sourceComp && sourceComp.name) {
        const footprintName = getKicadCompatibleComponentName(
          sourceComp as SourceComponentBase,
          cadComponent,
        )
        // Store both the component reference name and footprint name
        referenceMap.set(footprintName, {
          name: sourceComp.name,
          footprintName,
        })
      }
    }

    return referenceMap
  }

  /**
   * Builds a set of custom footprint names.
   * These are components WITHOUT footprinter_string.
   * Includes both the generated name and any metadata-provided footprintName,
   * since metadata may rename the libraryLink during PCB generation.
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

          // Also include metadata-provided footprintName (metadata may
          // rename libraryLink during intermediate PCB generation)
          const pcbComp = this.ctx.circuitJson.find(
            (el) =>
              el.type === "pcb_component" &&
              el.source_component_id === cadComponent.source_component_id,
          )
          if (
            pcbComp &&
            pcbComp.type === "pcb_component" &&
            pcbComp.metadata?.kicad_footprint?.footprintName
          ) {
            customNames.add(pcbComp.metadata.kicad_footprint.footprintName)
          }
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
    // Build map of component references to preserve original names
    const componentReferenceMap = this.buildComponentReferenceMap()

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
          componentReferenceMap,
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
    componentReferenceMap,
  }: {
    footprint: Footprint
    fpLibraryName: string
    customFootprintNames: Set<string>
    componentReferenceMap: Map<string, { name: string; footprintName: string }>
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

    // Set version and generator info
    footprint.version = KICAD_FP_VERSION
    footprint.generator = KICAD_FP_GENERATOR
    footprint.generatorVersion = KICAD_FP_GENERATOR_VERSION
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

    // Calculate pad bounding box to position reference/value labels
    const fpPads = footprint.fpPads ?? []
    let minY = 0
    let maxY = 0
    for (const pad of fpPads) {
      const at = pad.at
      const size = pad.size
      if (at && size) {
        const padY = at.y ?? 0
        const padHeight = size.height ?? 0
        const padTop = padY - padHeight / 2
        const padBottom = padY + padHeight / 2
        minY = Math.min(minY, padTop)
        maxY = Math.max(maxY, padBottom)
      }
    }
    // Position reference above pads (negative Y is up in KiCad) with 0.5mm margin
    const refY = minY - 0.5
    // Position value below pads with 0.5mm margin
    const valY = maxY + 0.5

    // Get the component reference designator (e.g., "R1", "C1") if available
    const componentRef = componentReferenceMap.get(footprintName)
    const referenceValue = componentRef?.name ?? "REF**"

    footprint.properties = [
      new Property({
        key: "Reference",
        value: referenceValue,
        position: [0, refY, 0],
        layer: "F.SilkS",
        uuid: generateDeterministicUuid(`${footprintName}-property-Reference`),
        effects: defaultEffects,
      }),
      new Property({
        key: "Value",
        value: "Val**",
        position: [0, valY, 0],
        layer: "F.Fab",
        uuid: generateDeterministicUuid(`${footprintName}-property-Value`),
        effects: defaultEffects,
      }),
      new Property({
        key: "Datasheet",
        value: "",
        position: [0, 0, 0],
        layer: "F.Fab",
        hidden: true,
        uuid: generateDeterministicUuid(`${footprintName}-property-Datasheet`),
        effects: defaultEffects,
      }),
      new Property({
        key: "Description",
        value: "",
        position: [0, 0, 0],
        layer: "F.Fab",
        hidden: true,
        uuid: generateDeterministicUuid(
          `${footprintName}-property-Description`,
        ),
        effects: defaultEffects,
      }),
    ]

    // Clean up texts
    const texts = footprint.fpTexts ?? []
    for (const text of texts) {
      text.uuid = undefined
      if (text.type === "reference") {
        text.text = referenceValue
      } else if (text.type === "value" && text.text.trim().length === 0) {
        text.text = footprintName
      }
    }
    footprint.fpTexts = texts

    // Clean up pads - generate UUIDs and clear net info
    const pads = footprint.fpPads ?? []
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i]
      if (pad) {
        pad.uuid = generateDeterministicUuid(
          `${footprintName}-pad-${pad.number ?? i}`,
        )
        pad.net = undefined
      }
    }
    footprint.fpPads = pads

    // Handle 3D models - update paths and collect original files
    const models = footprint.models ?? []
    const updatedModels: FootprintModel[] = []
    const modelFiles: string[] = []

    for (const model of models) {
      if (model.path) {
        const modelFilename = getBasename(model.path)
        const newPath = `../../3dmodels/${fpLibraryName}.3dshapes/${modelFilename}`

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
      componentReference: referenceValue,
    }
  }

  override getOutput(): KicadLibraryOutput {
    return this.ctx.libraryOutput!
  }
}
