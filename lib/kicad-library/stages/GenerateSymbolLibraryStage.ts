import type { CircuitJson } from "circuit-json"
import { KicadSymbolLib } from "kicadts"
import {
  ConverterStage,
  type ConverterContext,
  type KicadLibraryOutput,
  type SymbolEntry,
} from "../../types"

const KICAD_SYM_LIB_VERSION = 20211014
const GENERATOR = "circuit-json-to-kicad"

/**
 * Generates the KiCad symbol library file content from extracted symbols.
 */
export class GenerateSymbolLibraryStage extends ConverterStage<
  CircuitJson,
  KicadLibraryOutput
> {
  override _step(): void {
    const symbolEntries = this.ctx.symbolEntries ?? []
    const symbolLibrary = this.generateSymbolLibrary(symbolEntries)

    // Initialize the library output if not present
    if (!this.ctx.libraryOutput) {
      this.ctx.libraryOutput = {
        kicadSymString: "",
        symbols: [],
        footprints: [],
        fpLibTableString: "",
        symLibTableString: "",
        model3dSourcePaths: [],
      }
    }

    this.ctx.libraryOutput.kicadSymString = symbolLibrary
    this.finished = true
  }

  private generateSymbolLibrary(symbolEntries: SymbolEntry[]): string {
    const symbolLib = new KicadSymbolLib({
      version: KICAD_SYM_LIB_VERSION,
      generator: GENERATOR,
      symbols: symbolEntries.map((entry) => entry.symbol),
    })

    return symbolLib.getString()
  }

  override getOutput(): KicadLibraryOutput {
    return this.ctx.libraryOutput!
  }
}
