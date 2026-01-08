import type { CircuitJson, CadComponent } from "circuit-json"
import { parseKicadSexpr, KicadSch, SchematicSymbol } from "kicadts"
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
  /**
   * Build a set of footprinter_strings from cad_components.
   * Symbols with matching footprinter_strings are builtin/standard symbols.
   */
  private buildBuiltinFootprinterStrings(): Set<string> {
    const builtinStrings = new Set<string>()

    // Get all cad_components from circuit JSON
    const cadComponents = this.ctx.db.cad_component?.list() ?? []

    for (const cadComponent of cadComponents as CadComponent[]) {
      if (cadComponent.footprinter_string) {
        builtinStrings.add(cadComponent.footprinter_string)
      }
    }

    return builtinStrings
  }

  /**
   * Checks if a symbol name indicates it's a builtin symbol.
   * A symbol is builtin if its name contains a footprinter_string.
   */
  private isBuiltinSymbol(
    symbolName: string,
    builtinFootprinterStrings: Set<string>,
  ): boolean {
    for (const fps of builtinFootprinterStrings) {
      if (symbolName.includes(fps)) {
        return true
      }
    }
    return false
  }

  override _step(): void {
    const schContent = this.ctx.kicadSchString
    const fpLibraryName = this.ctx.fpLibraryName ?? "tscircuit"

    if (!schContent) {
      throw new Error(
        "Schematic content not available. Run GenerateKicadSchAndPcbStage first.",
      )
    }

    // Build set of builtin footprinter_strings from circuit JSON
    const builtinFootprinterStrings = this.buildBuiltinFootprinterStrings()

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

          // Update Footprint property to use the correct library name
          this.updateFootprintProperty(symbol, fpLibraryName)

          // Determine if this is a builtin symbol
          const isBuiltin = this.isBuiltinSymbol(
            symbolName,
            builtinFootprinterStrings,
          )

          uniqueSymbols.set(symbolName, {
            symbolName,
            symbol,
            isBuiltin,
          })
        }
      }
    } catch (error) {
      console.warn("Failed to parse schematic for symbol extraction:", error)
    }

    this.ctx.symbolEntries = Array.from(uniqueSymbols.values())
    this.finished = true
  }

  /**
   * Updates the Footprint property in a symbol to use the correct library name.
   * Changes "tscircuit:footprint_name" to "fpLibraryName:footprint_name"
   */
  private updateFootprintProperty(
    symbol: SchematicSymbol,
    fpLibraryName: string,
  ): void {
    const properties = symbol.properties ?? []
    for (const prop of properties) {
      if (prop.key === "Footprint" && prop.value) {
        // Replace any library prefix with the correct footprint library name
        const parts = prop.value.split(":")
        if (parts.length > 1) {
          prop.value = `${fpLibraryName}:${parts[1]}`
        } else if (prop.value.trim()) {
          // No prefix, add the library name
          prop.value = `${fpLibraryName}:${prop.value}`
        }
      }
    }
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
