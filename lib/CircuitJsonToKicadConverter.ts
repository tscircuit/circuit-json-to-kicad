import type { CircuitJson } from "circuit-json"
import { ConverterStage, type ConverterContext } from "./types"
import type { KicadSch } from "kicadts"

export class CircuitJsonToKicadSchConverter extends ConverterStage<
  CircuitJson,
  { kicadSch: KicadSch }
> {
  kicadSch: KicadSch

  constructor(
    private readonly circuitJson: CircuitJson,
    ctx: ConverterContext,
  ) {
    super(circuitJson, ctx)
  }

  override _step() {}
}
