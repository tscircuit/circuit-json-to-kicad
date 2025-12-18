import type { CircuitJson } from "circuit-json"
import {
  ConverterStage,
  type ConverterContext,
  type KicadLibraryOutput,
} from "../../types"
import { CircuitJsonToKicadSchConverter } from "../../schematic/CircuitJsonToKicadSchConverter"
import { CircuitJsonToKicadPcbConverter } from "../../pcb/CircuitJsonToKicadPcbConverter"

/**
 * Initializes the library conversion by running the schematic and PCB converters
 * to extract the base content needed for symbol and footprint extraction.
 */
export class InitializeLibraryStage extends ConverterStage<
  CircuitJson,
  KicadLibraryOutput
> {
  override _step(): void {
    // Generate schematic to extract symbols
    const schConverter = new CircuitJsonToKicadSchConverter(
      this.ctx.circuitJson,
    )
    schConverter.runUntilFinished()
    this.ctx.schematicContent = schConverter.getOutputString()

    // Generate PCB to extract footprints
    const pcbConverter = new CircuitJsonToKicadPcbConverter(
      this.ctx.circuitJson,
    )
    pcbConverter.runUntilFinished()
    this.ctx.pcbContent = pcbConverter.getOutputString()

    this.finished = true
  }

  override getOutput(): KicadLibraryOutput {
    return this.ctx.libraryOutput!
  }
}
