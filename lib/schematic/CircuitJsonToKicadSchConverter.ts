import type { CircuitJson } from "circuit-json"
import { ConverterStage, type ConverterContext } from "../types"
import { KicadSch } from "kicadts"
import { cju } from "@tscircuit/circuit-json-util"
import { compose, translate, scale } from "transformation-matrix"
import { InitializeSchematicStage } from "./stages/InitializeSchematicStage"
import { AddLibrarySymbolsStage } from "./stages/AddLibrarySymbolsStage"
import { AddSchematicSymbolsStage } from "./stages/AddSchematicSymbolsStage"
import { AddSchematicNetLabelsStage } from "./stages/AddSchematicNetLabelsStage"
import { AddSchematicTracesStage } from "./stages/AddSchematicTracesStage"
import { AddSheetInstancesStage } from "./stages/AddSheetInstancesStage"
import { getSchematicBoundsAndCenter } from "./getSchematicBoundsAndCenter"
import { selectSchematicPaperSize } from "./selectSchematicPaperSize"

const DEFAULT_SCHEMATIC_SCALE_FACTOR = 15

export class CircuitJsonToKicadSchConverter {
  ctx: ConverterContext

  pipeline: ConverterStage<CircuitJson, KicadSch>[]
  currentStageIndex = 0

  finished = false

  get currentStage() {
    return this.pipeline[this.currentStageIndex]
  }

  constructor(circuitJson: CircuitJson) {
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
}
