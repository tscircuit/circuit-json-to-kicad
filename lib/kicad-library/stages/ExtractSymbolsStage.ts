import type { CircuitJson } from "circuit-json"
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
   * Checks if a symbol is custom (user-specified symbol={<symbol>...</symbol>}).
   * Custom symbols have libraryId starting with "Custom:".
   */
  private isCustomSymbol(libraryId?: string): boolean {
    return libraryId?.startsWith("Custom:") ?? false
  }

  override _step(): void {
    const schContent = this.ctx.kicadSchString
    const fpLibraryName = this.ctx.fpLibraryName ?? "tscircuit"

    if (!schContent) {
      throw new Error(
        "Schematic content not available. Run GenerateKicadSchAndPcbStage first.",
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
        // Check if custom BEFORE sanitizing (Custom: prefix is removed by sanitize)
        const isCustom = this.isCustomSymbol(symbol.libraryId)

        const symbolName = this.sanitizeSymbolName(symbol.libraryId)
        if (!uniqueSymbols.has(symbolName)) {
          // Update libraryId for standalone library use
          symbol.libraryId = symbolName

          // Update Footprint property to use the correct library name
          this.updateFootprintProperty(symbol, fpLibraryName)

          // Snap pin positions to 1.27mm grid for proper KiCad wire connections
          // Only for non-custom symbols (chips) - custom symbols have intentionally designed coordinates
          // This is done post-extraction so schematic trace alignment isn't affected
          if (!isCustom) {
            this.snapPinPositionsToGrid(symbol)
          }

          uniqueSymbols.set(symbolName, {
            symbolName,
            symbol,
            isBuiltin: !isCustom,
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

  /**
   * Snap pin positions to KiCad's 1.27mm grid.
   * This is necessary for library symbols so users can connect wires in KiCad.
   * Done post-extraction so schematic trace alignment in the snapshots isn't affected.
   */
  private snapPinPositionsToGrid(symbol: SchematicSymbol): void {
    const KICAD_GRID = 1.27

    // Process all subsymbols (pins are typically in _1_1 subsymbol)
    for (const subSymbol of symbol.subSymbols ?? []) {
      for (const pin of subSymbol.pins ?? []) {
        // pin.at is an At object with x, y, angle properties
        if (pin.at) {
          pin.at.x = Math.round(pin.at.x / KICAD_GRID) * KICAD_GRID
          pin.at.y = Math.round(pin.at.y / KICAD_GRID) * KICAD_GRID
        }
      }

      // Also snap polyline points (box edges) so they align with snapped pins
      for (const polyline of subSymbol.polylines ?? []) {
        if (polyline.points?.points) {
          for (const pt of polyline.points.points) {
            // Only process Xy points (not PtsArc)
            if ("x" in pt && "y" in pt) {
              pt.x = Math.round(pt.x / KICAD_GRID) * KICAD_GRID
              pt.y = Math.round(pt.y / KICAD_GRID) * KICAD_GRID
            }
          }
        }
      }
    }
  }

  override getOutput(): KicadLibraryOutput {
    return this.ctx.libraryOutput!
  }
}
