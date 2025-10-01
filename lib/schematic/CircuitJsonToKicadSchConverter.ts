import type { CircuitJson } from "circuit-json"
import { ConverterStage, type ConverterContext } from "../types"
import { KicadSch } from "kicadts"
import { cju } from "@tscircuit/circuit-json-util"
import { compose, translate, scale } from "transformation-matrix"
import { InitializeSchematicStage } from "./stages/InitializeSchematicStage"
import { AddLibrarySymbolsStage } from "./stages/AddLibrarySymbolsStage"
import { AddSchematicSymbolsStage } from "./stages/AddSchematicSymbolsStage"
import { AddSchematicTracesStage } from "./stages/AddSchematicTracesStage"
import { AddSheetInstancesStage } from "./stages/AddSheetInstancesStage"

export class CircuitJsonToKicadSchConverter {
  ctx: ConverterContext

  pipeline: ConverterStage<CircuitJson, KicadSch>[]
  currentStageIndex = 0

  finished = false

  get currentStage() {
    return this.pipeline[this.currentStageIndex]
  }

  constructor(circuitJson: CircuitJson) {
    const SCALE_CIRCUIT_JSON_FACTOR = 10
    const KICAD_CENTER_X = 95.25
    const KICAD_CENTER_Y = 73.66

    this.ctx = {
      db: cju(circuitJson),
      circuitJson,
      kicadSch: new KicadSch({
        generator: "circuit-json-to-kicad",
        generatorVersion: "0.0.1",
      }),
      c2kMatSch: compose(
        translate(KICAD_CENTER_X, KICAD_CENTER_Y),
        scale(SCALE_CIRCUIT_JSON_FACTOR, SCALE_CIRCUIT_JSON_FACTOR),
      ),
    }
    this.pipeline = [
      new InitializeSchematicStage(circuitJson, this.ctx),
      new AddLibrarySymbolsStage(circuitJson, this.ctx),
      new AddSchematicSymbolsStage(circuitJson, this.ctx),
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
    return this.ctx.kicadSch
  }

  /**
   * Get the output as a string
   */
  getOutputString(): string {
    return this.ctx.kicadSch.getString()
  }
}
