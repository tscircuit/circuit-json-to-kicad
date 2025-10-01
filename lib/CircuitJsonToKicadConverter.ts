import type { CircuitJson } from "circuit-json"
import { ConverterStage, type ConverterContext } from "./types"
import { KicadSch } from "kicadts"
import { cju } from "@tscircuit/circuit-json-util"

export class CircuitJsonToKicadSchConverter {
  ctx: ConverterContext

  constructor(circuitJson: CircuitJson) {
    this.ctx = {
      db: cju(circuitJson),
      circuitJson,
      kicadSch: new KicadSch({
        generator: "circuit-json-to-kicad",
        generatorVersion: "0.0.1",
      }),
    }
  }

  override _step() {}
}
