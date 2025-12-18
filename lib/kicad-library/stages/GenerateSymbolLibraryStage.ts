import type { CircuitJson } from "circuit-json"
import { KicadSchVersion, KicadSchGenerator } from "kicadts"
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
    const symbols = this.ctx.symbolEntries ?? []
    const symbolLibrary = this.generateSymbolLibrary(symbols)

    // Initialize the library output if not present
    if (!this.ctx.libraryOutput) {
      this.ctx.libraryOutput = {
        symbolLibrary: "",
        footprints: [],
        fpLibTable: "",
        symLibTable: "",
        modelFiles: [],
      }
    }

    this.ctx.libraryOutput.symbolLibrary = symbolLibrary
    this.finished = true
  }

  private generateSymbolLibrary(symbols: SymbolEntry[]): string {
    const version = new KicadSchVersion(KICAD_SYM_LIB_VERSION)
    const generator = new KicadSchGenerator(GENERATOR)

    const lines: string[] = []

    lines.push("(kicad_symbol_lib")
    lines.push(`\t${version.getString()}`)
    lines.push(`\t${generator.getString()}`)

    for (const symbol of symbols) {
      const symbolLines = symbol.content.split("\n")
      for (const line of symbolLines) {
        lines.push(`\t${line}`)
      }
    }

    lines.push(")")

    return lines.join("\n")
  }

  override getOutput(): KicadLibraryOutput {
    return this.ctx.libraryOutput!
  }
}
