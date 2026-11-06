import type { CircuitJson } from "circuit-json"
import { parseKicadMod } from "kicadts"
import { CircuitJsonToKicadLibraryConverter } from "../kicad-library/CircuitJsonToKicadLibraryConverter"
import type { FootprintEntry } from "../types"

export interface CircuitJsonToKicadModOptions {
  libraryName?: string
  footprintLibraryName?: string
  footprintName?: string
}

const FOOTPRINT_ELEMENT_TYPES = new Set([
  "pcb_smtpad",
  "pcb_plated_hole",
  "pcb_hole",
  "pcb_solder_paste",
  "pcb_silkscreen_text",
  "pcb_silkscreen_path",
  "pcb_silkscreen_circle",
  "pcb_silkscreen_rect",
  "pcb_silkscreen_line",
  "pcb_silkscreen_oval",
  "pcb_fabrication_note_path",
  "pcb_fabrication_note_rect",
  "pcb_fabrication_note_text",
  "pcb_note_text",
  "pcb_note_rect",
  "pcb_note_path",
  "pcb_note_line",
  "pcb_courtyard_circle",
  "pcb_courtyard_rect",
  "pcb_courtyard_outline",
  "pcb_port",
  "cad_component",
])

function isPlaceholderFootprintText(element: any): boolean {
  if (element?.type !== "pcb_silkscreen_text") return false
  const text = typeof element.text === "string" ? element.text.trim() : ""
  return text === "{REF}" || text === "{VAL}" || text === "{NAME}"
}

function normalizeCircuitJsonForKicadMod(
  circuitJson: CircuitJson,
  footprintName?: string,
): CircuitJson {
  const elements = Array.isArray(circuitJson) ? circuitJson : []
  const pcbComponents = elements.filter(
    (el: any) => el?.type === "pcb_component",
  ) as any[]

  if (pcbComponents.length > 1) {
    return circuitJson
  }

  const hasFootprintElements = elements.some((el: any) =>
    FOOTPRINT_ELEMENT_TYPES.has(el?.type),
  )
  if (pcbComponents.length === 0 && !hasFootprintElements) {
    return circuitJson
  }

  const existingPcbComponent = pcbComponents[0]
  const targetPcbComponentId =
    existingPcbComponent?.pcb_component_id || "pcb_component_0"
  const targetSourceComponentId =
    existingPcbComponent?.source_component_id || "source_component_0"

  const hasMatchingSourceComponent = elements.some(
    (el: any) =>
      el?.type === "source_component" &&
      el?.source_component_id === targetSourceComponentId,
  )

  const normalized: any[] = []

  if (!hasMatchingSourceComponent) {
    normalized.push({
      type: "source_component",
      source_component_id: targetSourceComponentId,
      name: "REF**",
      ftype: "simple_chip",
      ...(footprintName ? { manufacturer_part_number: footprintName } : {}),
    })
  }

  if (!existingPcbComponent) {
    normalized.push({
      type: "pcb_component",
      pcb_component_id: targetPcbComponentId,
      source_component_id: targetSourceComponentId,
      center: { x: 0, y: 0 },
      width: 0,
      height: 0,
      layer: "top",
      rotation: 0,
      obstructs_within_bounds: false,
      ...(footprintName
        ? {
            metadata: {
              kicad_footprint: {
                footprintName,
              },
            },
          }
        : {}),
    })
  }

  for (const element of elements as any[]) {
    if (isPlaceholderFootprintText(element)) {
      continue
    }

    if (element?.type === "pcb_component" && existingPcbComponent) {
      normalized.push({
        ...element,
        pcb_component_id: targetPcbComponentId,
        source_component_id: targetSourceComponentId,
      })
      continue
    }

    if (FOOTPRINT_ELEMENT_TYPES.has(element?.type)) {
      const updated: Record<string, any> = {
        ...element,
        pcb_component_id: targetPcbComponentId,
      }
      if (element.type === "cad_component" && !element.source_component_id) {
        updated.source_component_id = targetSourceComponentId
      }
      normalized.push(updated)
      continue
    }

    normalized.push(element)
  }

  return normalized as CircuitJson
}

export class CircuitJsonToKicadModConverter {
  private readonly libraryConverter: CircuitJsonToKicadLibraryConverter
  private readonly footprintName?: string

  constructor(
    circuitJson: CircuitJson,
    options: CircuitJsonToKicadModOptions = {},
  ) {
    this.footprintName = options.footprintName
    const normalizedCircuitJson = normalizeCircuitJsonForKicadMod(
      circuitJson,
      options.footprintName,
    )
    this.libraryConverter = new CircuitJsonToKicadLibraryConverter(
      normalizedCircuitJson,
      {
        libraryName: options.libraryName,
        footprintLibraryName: options.footprintLibraryName,
      },
    )
  }

  get finished(): boolean {
    return this.libraryConverter.finished
  }

  get currentStage() {
    return this.libraryConverter.currentStage
  }

  step(): void {
    this.libraryConverter.step()
  }

  runUntilFinished(): void {
    this.libraryConverter.runUntilFinished()
  }

  getOutput(): FootprintEntry {
    const footprints = this.libraryConverter.getFootprints()

    if (this.footprintName) {
      const bareRequestedName =
        this.footprintName.split(":").pop()?.trim() || this.footprintName
      const matchingFootprint = footprints.find(
        (footprint) =>
          footprint.footprintName === this.footprintName ||
          footprint.footprintName === bareRequestedName,
      )

      if (matchingFootprint) {
        return matchingFootprint
      }

      if (footprints.length === 1) {
        const singleFootprint = footprints[0]!
        const parsedFootprint = parseKicadMod(singleFootprint.kicadModString)
        parsedFootprint.libraryLink = bareRequestedName
        return {
          ...singleFootprint,
          footprintName: bareRequestedName,
          kicadModString: parsedFootprint.getString(),
        }
      }

      throw new Error(
        `Footprint "${this.footprintName}" not found. Available footprints: ${footprints
          .map((footprint) => footprint.footprintName)
          .join(", ")}`,
      )
    }

    if (footprints.length === 1) {
      return footprints[0]!
    }

    const customFootprints = footprints.filter(
      (footprint) => !footprint.isBuiltin,
    )
    if (customFootprints.length === 1) {
      return customFootprints[0]!
    }

    throw new Error(
      `Multiple footprints were generated. Pass footprintName to CircuitJsonToKicadModConverter. Available footprints: ${footprints
        .map((footprint) => footprint.footprintName)
        .join(", ")}`,
    )
  }

  getOutputString(): string {
    return this.getOutput().kicadModString
  }

  getModel3dSourcePaths(): string[] {
    return this.getOutput().model3dSourcePaths
  }
}
