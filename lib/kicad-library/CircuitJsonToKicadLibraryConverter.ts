import type { CircuitJson } from "circuit-json"
import { cju } from "@tscircuit/circuit-json-util"
import {
  ConverterStage,
  type ConverterContext,
  type KicadLibraryOutput,
  type SymbolEntry,
  type FootprintEntry,
} from "../types"
import { GenerateKicadSchAndPcbStage } from "./stages/GenerateKicadSchAndPcbStage"
import { ExtractSymbolsStage } from "./stages/ExtractSymbolsStage"
import { ExtractFootprintsStage } from "./stages/ExtractFootprintsStage"
import { GenerateSymbolLibraryStage } from "./stages/GenerateSymbolLibraryStage"
import { GenerateLibraryTablesStage } from "./stages/GenerateLibraryTablesStage"

interface CircuitJsonToKicadLibraryOptions {
  libraryName?: string
  footprintLibraryName?: string
}

// Re-export types for backwards compatibility
export type { SymbolEntry, FootprintEntry, KicadLibraryOutput }

export class CircuitJsonToKicadLibraryConverter {
  ctx: ConverterContext

  pipeline: ConverterStage<CircuitJson, KicadLibraryOutput>[]
  currentStageIndex = 0

  finished = false

  get currentStage() {
    return this.pipeline[this.currentStageIndex]
  }

  constructor(
    circuitJson: CircuitJson,
    options: CircuitJsonToKicadLibraryOptions = {},
  ) {
    this.ctx = {
      db: cju(circuitJson),
      circuitJson,
      libraryName: options.libraryName ?? "tscircuit",
      fpLibraryName: options.footprintLibraryName ?? "tscircuit",
    }

    this.pipeline = [
      new GenerateKicadSchAndPcbStage(circuitJson, this.ctx),
      new ExtractSymbolsStage(circuitJson, this.ctx),
      new ExtractFootprintsStage(circuitJson, this.ctx),
      new GenerateSymbolLibraryStage(circuitJson, this.ctx),
      new GenerateLibraryTablesStage(circuitJson, this.ctx),
    ]
  }

  step() {
    if (!this.currentStage) {
      this.finished = true
      return
    }
    this.currentStage.step()
    if (this.currentStage.finished) {
      this.currentStageIndex++
    }
  }

  runUntilFinished(): void {
    while (!this.finished) {
      this.step()
    }
  }

  getOutput(): KicadLibraryOutput {
    if (!this.ctx.libraryOutput) {
      throw new Error("Converter has not been run yet")
    }
    return this.ctx.libraryOutput
  }

  getSymbolLibraryString(): string {
    return this.getOutput().kicadSymString
  }

  getFootprints(): FootprintEntry[] {
    return this.getOutput().footprints
  }

  getKicadModString(footprintName?: string): string {
    return this.resolveFootprintEntry(footprintName).kicadModString
  }

  getFpLibTableString(): string {
    return this.getOutput().fpLibTableString
  }

  getSymLibTableString(): string {
    return this.getOutput().symLibTableString
  }

  getModel3dSourcePaths(): string[] {
    return this.getOutput().model3dSourcePaths
  }

  private resolveFootprintEntry(footprintName?: string): FootprintEntry {
    const footprints = this.getFootprints()

    if (footprintName) {
      const matchingFootprint = footprints.find(
        (footprint) => footprint.footprintName === footprintName,
      )

      if (matchingFootprint) {
        return matchingFootprint
      }

      throw new Error(
        `Footprint "${footprintName}" not found. Available footprints: ${footprints
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
      `Multiple footprints were generated. Pass a footprintName to getKicadModString(). Available footprints: ${footprints
        .map((footprint) => footprint.footprintName)
        .join(", ")}`,
    )
  }
}
