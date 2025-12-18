import type { CircuitJson } from "circuit-json"
import { parseKicadSexpr, KicadSch } from "kicadts"
import {
  ConverterStage,
  type ConverterContext,
  type KicadLibraryOutput,
  type SymbolEntry,
} from "../../types"

/**
 * Extracts schematic symbols from the generated schematic content.
 */
export class ExtractSymbolsStage extends ConverterStage<
  CircuitJson,
  KicadLibraryOutput
> {
  override _step(): void {
    const schContent = this.ctx.schematicContent

    if (!schContent) {
      throw new Error(
        "Schematic content not available. Run InitializeLibraryStage first.",
      )
    }

    const uniqueSymbols = new Map<string, SymbolEntry>()

    try {
      const parsed = parseKicadSexpr(schContent)
      const sch = parsed.find(
        (node): node is KicadSch => node instanceof KicadSch,
      )
      if (!sch) {
        this.ctx.symbolEntries = []
        this.finished = true
        return
      }

      const libSymbols = sch.libSymbols
      if (!libSymbols) {
        this.ctx.symbolEntries = []
        this.finished = true
        return
      }

      const symbols = libSymbols.symbols ?? []
      for (const symbol of symbols) {
        const symbolName = this.sanitizeSymbolName(symbol.libraryId)
        if (!uniqueSymbols.has(symbolName)) {
          // Update libraryId for standalone library use
          symbol.libraryId = symbolName
          uniqueSymbols.set(symbolName, {
            symbolName,
            content: symbol.getString(),
          })
        }
      }
    } catch (error) {
      console.warn("Failed to parse schematic for symbol extraction:", error)
    }

    this.ctx.symbolEntries = Array.from(uniqueSymbols.values())
    this.finished = true
  }

  private sanitizeSymbolName(libraryId?: string): string {
    if (!libraryId) return "symbol"
    // Remove library prefix if present (e.g., "Device:R" -> "R")
    const parts = libraryId.split(":")
    const name = parts.length > 1 ? parts[1] : parts[0]
    return name?.replace(/[\\\/]/g, "-").trim() || "symbol"
  }

  override getOutput(): KicadLibraryOutput {
    return this.ctx.libraryOutput!
  }
}
