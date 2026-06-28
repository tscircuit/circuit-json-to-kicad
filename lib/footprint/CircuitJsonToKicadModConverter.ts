import type { CircuitJson } from "circuit-json"
import type { FootprintEntry } from "../types"
import { CircuitJsonToKicadLibraryConverter } from "../kicad-library/CircuitJsonToKicadLibraryConverter"

interface CircuitJsonToKicadModOptions {
  libraryName?: string
  footprintLibraryName?: string
  footprintName?: string
}

export class CircuitJsonToKicadModConverter {
  private readonly libraryConverter: CircuitJsonToKicadLibraryConverter
  private readonly footprintName?: string

  constructor(
    circuitJson: CircuitJson,
    options: CircuitJsonToKicadModOptions = {},
  ) {
    this.footprintName = options.footprintName
    this.libraryConverter = new CircuitJsonToKicadLibraryConverter(
      circuitJson,
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
      const matchingFootprint = footprints.find(
        (footprint) => footprint.footprintName === this.footprintName,
      )

      if (matchingFootprint) {
        return matchingFootprint
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
