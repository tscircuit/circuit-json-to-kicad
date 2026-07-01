import { cju } from "@tscircuit/circuit-json-util"
import type { CircuitJson } from "circuit-json"
import { KicadSch } from "kicadts"
import { compose, scale, translate } from "transformation-matrix"
import type { ConverterContext, ConverterStage } from "../types"
import { getSchematicBoundsAndCenter } from "./getSchematicBoundsAndCenter"
import { selectSchematicPaperSize } from "./selectSchematicPaperSize"
import { AddLibrarySymbolsStage } from "./stages/AddLibrarySymbolsStage"
import { AddSchematicGraphicsStage } from "./stages/AddSchematicGraphicsStage"
import { AddSchematicNetLabelsStage } from "./stages/AddSchematicNetLabelsStage"
import { AddSchematicSymbolsStage } from "./stages/AddSchematicSymbolsStage"
import { AddSchematicTracesStage } from "./stages/AddSchematicTracesStage"
import { AddSheetInstancesStage } from "./stages/AddSheetInstancesStage"
import { CreateSchematicSheetFilesStage } from "./stages/CreateSchematicSheetFilesStage"
import { InitializeSchematicStage } from "./stages/InitializeSchematicStage"

const DEFAULT_SCHEMATIC_SCALE_FACTOR = 15

export interface KicadSchFile {
  filename: string
  content: string
}

export interface KicadSchFileOutputOptions {
  schematicFilename: string
}

interface CircuitJsonToKicadSchConverterOptions {
  schematicUuid?: string
  schematicInstancePath?: string
  schematicPageNumber?: string
}

export class CircuitJsonToKicadSchConverter {
  ctx: ConverterContext
  circuitJson: CircuitJson

  pipeline: ConverterStage<CircuitJson, KicadSch>[]
  currentStageIndex = 0

  finished = false

  get currentStage() {
    return this.pipeline[this.currentStageIndex]
  }

  constructor(
    circuitJson: CircuitJson,
    options: CircuitJsonToKicadSchConverterOptions = {},
  ) {
    this.circuitJson = circuitJson
    const kicadSchematicScaleFactor = DEFAULT_SCHEMATIC_SCALE_FACTOR

    const db = cju(circuitJson)

    const { center, bounds } = getSchematicBoundsAndCenter(db)

    // Calculate the size of the schematic in KiCad coordinates (mm)
    const schematicWidthMm =
      (bounds.maxX - bounds.minX) * kicadSchematicScaleFactor
    const schematicHeightMm =
      (bounds.maxY - bounds.minY) * kicadSchematicScaleFactor

    // Select appropriate paper size based on content
    const paperSize = selectSchematicPaperSize(
      schematicWidthMm,
      schematicHeightMm,
    )

    // Use the center of the selected paper size
    const KICAD_CENTER_X = paperSize.width / 2
    const KICAD_CENTER_Y = paperSize.height / 2

    this.ctx = {
      db,
      circuitJson,
      kicadSch: new KicadSch({
        generator: "circuit-json-to-kicad",
        generatorVersion: "0.0.1",
      }),
      kicadSchematicScaleFactor,
      schematicPaperSize: paperSize,
      schematicUuid: options.schematicUuid,
      schematicInstancePath: options.schematicInstancePath,
      schematicPageNumber: options.schematicPageNumber,
      c2kMatSch: compose(
        translate(KICAD_CENTER_X, KICAD_CENTER_Y),
        scale(kicadSchematicScaleFactor, -kicadSchematicScaleFactor),
        translate(-center.x, -center.y),
      ),
    }
    this.pipeline = [
      new InitializeSchematicStage(circuitJson, this.ctx),
      new AddLibrarySymbolsStage(circuitJson, this.ctx),
      new AddSchematicSymbolsStage(circuitJson, this.ctx),
      new AddSchematicNetLabelsStage(circuitJson, this.ctx),
      new AddSchematicTracesStage(circuitJson, this.ctx),
      new AddSchematicGraphicsStage(circuitJson, this.ctx),
      new AddSheetInstancesStage(circuitJson, this.ctx),
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

  runUntilFinished() {
    while (!this.finished) {
      this.step()
    }
  }

  getOutput(): KicadSch {
    return this.ctx.kicadSch!
  }

  /**
   * Get the output as a string
   */
  getOutputString(): string {
    return this.ctx.kicadSch!.getString()
  }

  /**
   * Returns every KiCad schematic file produced by this converter.
   *
   * Today this is a single root schematic file. This API is intentionally a
   * file list so hierarchical schematic sheets can add child .kicad_sch files
   * without changing callers.
   */
  getOutputFiles(options: KicadSchFileOutputOptions): KicadSchFile[] {
    return new CreateSchematicSheetFilesStage(
      this.circuitJson,
      this.getOutputString(),
      options,
    ).getOutputFiles()
  }
}
