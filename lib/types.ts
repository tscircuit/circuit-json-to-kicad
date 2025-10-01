import type { CircuitJsonUtilObjects } from "@tscircuit/circuit-json-util"
import type { KicadSch } from "kicadts"

export interface ConverterContext {
  db: CircuitJsonUtilObjects
  kicadSch: KicadSch
}

export abstract class ConverterStage<Input, Output> {
  MAX_ITERATIONS = 1000
  iteration = 0

  finished = false

  input: Input
  ctx: ConverterContext

  constructor(input: Input, ctx: ConverterContext) {
    this.input = input
    this.ctx = ctx
  }

  step(): void {
    this.iteration++
    if (this.iteration > this.MAX_ITERATIONS) {
      throw new Error("Max iterations reached")
    }
    this._step()
  }

  _step(): void {
    throw new Error("Not implemented")
  }

  runUntilFinished(): void {
    while (!this.finished) {
      this.step()
    }
  }

  getOutput(): Output {
    throw new Error("Not implemented")
  }
}
