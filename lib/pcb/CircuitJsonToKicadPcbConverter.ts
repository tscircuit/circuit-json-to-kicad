import type { CircuitJson } from "circuit-json"
import { ConverterStage, type ConverterContext } from "../types"
import { KicadPcb } from "kicadts"
import { cju } from "@tscircuit/circuit-json-util"
import { compose, translate, scale } from "transformation-matrix"
import { InitializePcbStage } from "./stages/InitializePcbStage"
import { AddNetsStage } from "./stages/AddNetsStage"
import { AddFootprintsStage } from "./stages/AddFootprintsStage"
import { AddTracesStage } from "./stages/AddTracesStage"
import { AddViasStage } from "./stages/AddViasStage"
import { AddGraphicsStage } from "./stages/AddGraphicsStage"

export class CircuitJsonToKicadPcbConverter {
  ctx: ConverterContext

  pipeline: ConverterStage<CircuitJson, KicadPcb>[]
  currentStageIndex = 0

  finished = false

  get currentStage() {
    return this.pipeline[this.currentStageIndex]
  }

  constructor(circuitJson: CircuitJson) {
    // PCB scale factor and center point
    // PCBs typically use mm units and different scaling than schematics
    const CIRCUIT_JSON_TO_MM_SCALE = 1 // Circuit JSON uses mm, KiCad PCB uses mm
    const KICAD_PCB_CENTER_X = 100 // mm
    const KICAD_PCB_CENTER_Y = 100 // mm

    this.ctx = {
      db: cju(circuitJson),
      circuitJson,
      kicadPcb: new KicadPcb({
        generator: "circuit-json-to-kicad",
        generatorVersion: "0.0.1",
      }),
      c2kMatPcb: compose(
        translate(KICAD_PCB_CENTER_X, KICAD_PCB_CENTER_Y),
        scale(CIRCUIT_JSON_TO_MM_SCALE, -CIRCUIT_JSON_TO_MM_SCALE),
      ),
    }

    this.pipeline = [
      new InitializePcbStage(circuitJson, this.ctx),
      new AddNetsStage(circuitJson, this.ctx),
      new AddFootprintsStage(circuitJson, this.ctx),
      new AddTracesStage(circuitJson, this.ctx),
      new AddViasStage(circuitJson, this.ctx),
      new AddGraphicsStage(circuitJson, this.ctx),
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

  getOutput(): KicadPcb {
    return this.ctx.kicadPcb!
  }

  /**
   * Get the output as a string
   */
  getOutputString(): string {
    return this.ctx.kicadPcb!.getString()
  }
}
