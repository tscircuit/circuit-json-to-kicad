import type {
  CircuitJson,
  SchematicNetLabel,
  SchematicComponent,
  SchematicPort,
  SourceComponentBase,
} from "circuit-json"
import type { KicadSch } from "kicadts"
import {
  EmbeddedFonts,
  LibSymbols,
  SchematicSymbol,
  SymbolPinNames,
  SymbolPinNumbers,
} from "kicadts"
import { ConverterStage } from "../../types"
import { symbols } from "schematic-symbols"
import { getLibraryId } from "../getLibraryId"
import {
  getKicadCompatibleComponentName,
  getReferencePrefixForComponent,
} from "../../utils/getKicadCompatibleComponentName"
import { buildSymbolDataFromSchematicPrimitives } from "./symbols-stage-converters/buildSymbolDataFromSchematicPrimitives"
import { createDrawingSubsymbol } from "./symbols-stage-converters/createDrawingSubsymbol"
import { createGenericChipSymbolData } from "./symbols-stage-converters/createGenericChipSymbolData"
import { addSymbolProperties } from "./utils/addSymbolProperties"
import { createPinSubsymbol } from "./utils/createPinSubsymbol"

/**
 * Adds library symbol definitions from schematic-symbols to the lib_symbols section.
 * Also handles custom symbols defined via schematic_symbol elements.
 */
export class AddLibrarySymbolsStage extends ConverterStage<
  CircuitJson,
  KicadSch
> {
  // Track processed symbol names to avoid duplicates
  private processedSymbolNames: Set<string> = new Set()

  override _step(): void {
    const { kicadSch, db } = this.ctx

    // Create lib_symbols section
    const libSymbols = new LibSymbols()
    const librarySymbols: SchematicSymbol[] = []

    // Reset processed symbol names for this run
    this.processedSymbolNames = new Set()

    // Process schematic components
    const schematicComponents = db.schematic_component.list()
    for (const schematicComponent of schematicComponents) {
      const libSymbol = this.createLibrarySymbolForComponent(schematicComponent)
      if (libSymbol) {
        librarySymbols.push(libSymbol)
      }
    }

    // Process schematic net labels with symbol names
    const netLabels = db.schematic_net_label?.list?.() || []
    for (const netLabel of netLabels) {
      if (netLabel.symbol_name) {
        const isPower = netLabel.source_net_id
          ? db.source_net.get(netLabel.source_net_id)?.is_power
          : false
        const isGround = netLabel.source_net_id
          ? db.source_net.get(netLabel.source_net_id)?.is_ground
          : false

        const isPowerOrGround = isPower || isGround

        if (isPowerOrGround) {
          const libSymbol = this.createLibrarySymbolForNetLabel({
            netLabel,
            isPower: isPower ?? false,
            isGround: isGround ?? false,
          })
          if (libSymbol) {
            librarySymbols.push(libSymbol)
          }
        }
      }
    }

    libSymbols.symbols = librarySymbols
    if (kicadSch) {
      kicadSch.libSymbols = libSymbols
    }

    this.finished = true
  }

  /**
   * Create library symbol for a schematic component.
   * Handles both builtin symbols and custom symbols defined via schematic_symbol elements.
   */
  private createLibrarySymbolForComponent(
    schematicComponent: SchematicComponent,
  ): SchematicSymbol | null {
    const { db } = this.ctx

    const sourceComp = schematicComponent.source_component_id
      ? db.source_component.get(schematicComponent.source_component_id)
      : null

    if (!sourceComp) return null

    // Get the cad_component for footprinter_string (if available)
    const cadComponent = db.cad_component
      ?.list()
      ?.find(
        (cad: any) =>
          cad.source_component_id === sourceComp.source_component_id,
      )

    // Check if this component has a custom symbol via schematic_symbol_id
    // First check if schematic_component has it directly
    let schematicSymbolId = (schematicComponent as any).schematic_symbol_id

    // If not on the component, check if there are primitives linked to this component
    // that have a schematic_symbol_id (tscircuit links primitives to components this way)
    if (!schematicSymbolId) {
      const linkedPrimitive = this.ctx.circuitJson.find(
        (el: any) =>
          (el.type === "schematic_line" ||
            el.type === "schematic_circle" ||
            el.type === "schematic_path") &&
          el.schematic_component_id ===
            schematicComponent.schematic_component_id &&
          el.schematic_symbol_id,
      ) as any
      if (linkedPrimitive) {
        schematicSymbolId = linkedPrimitive.schematic_symbol_id
      }
    }

    if (schematicSymbolId) {
      return this.createLibrarySymbolFromSchematicSymbol(
        schematicComponent,
        sourceComp,
        cadComponent,
        schematicSymbolId,
      )
    }

    const symbolName =
      schematicComponent.symbol_name ||
      (sourceComp.ftype === "simple_chip"
        ? `generic_chip_${schematicComponent.source_component_id}`
        : null)

    if (!symbolName) return null

    const symbolData = this.getSymbolData(symbolName, schematicComponent)
    if (!symbolData) return null

    const libId = getLibraryId(sourceComp, schematicComponent, cadComponent)
    const isChip = sourceComp.ftype === "simple_chip"

    // Get footprint name for symbol-footprint linkage using ergonomic naming
    const footprintName = getKicadCompatibleComponentName(
      sourceComp,
      cadComponent,
    )

    return this.createLibrarySymbol({
      libId,
      symbolData,
      isChip,
      schematicComponent,
      description: this.getDescription(sourceComp),
      keywords: this.getKeywords(sourceComp),
      fpFilters: this.getFpFilters(sourceComp),
      footprintRef: footprintName ? `tscircuit:${footprintName}` : "",
      referencePrefix: getReferencePrefixForComponent(sourceComp),
    })
  }

  /**
   * Create library symbol from a schematic_symbol element.
   * This handles custom symbols defined via JSX like:
   * <chip name="Q1" symbol={<symbol>...</symbol>} />
   *
   * Naming precedence:
   * 1. schematic_symbol.name (highest priority)
   * 2. manufacturer_part_number / footprinter_string
   * 3. Generated name based on ftype
   */
  private createLibrarySymbolFromSchematicSymbol(
    schematicComponent: SchematicComponent,
    sourceComp: SourceComponentBase,
    cadComponent: any,
    schematicSymbolId: string,
  ): SchematicSymbol | null {
    const { db } = this.ctx

    // Look up the schematic_symbol element
    // Since this is a new type, access it via the raw circuitJson
    const schematicSymbol = this.ctx.circuitJson.find(
      (el: any) =>
        el.type === "schematic_symbol" &&
        el.schematic_symbol_id === schematicSymbolId,
    ) as any

    if (!schematicSymbol) {
      // Fall back to standard symbol handling if schematic_symbol not found
      return null
    }

    // Determine symbol name using precedence:
    // 1. schematic_symbol.name
    // 2. manufacturer_part_number / footprinter_string (via getKicadCompatibleComponentName)
    // 3. Generated name based on ftype
    let symbolName: string
    if (schematicSymbol.name) {
      symbolName = schematicSymbol.name
    } else {
      const ergonomicName = getKicadCompatibleComponentName(
        sourceComp,
        cadComponent,
      )
      if (ergonomicName) {
        symbolName = ergonomicName
      } else {
        symbolName = `custom_${sourceComp.ftype || "component"}_${schematicSymbolId}`
      }
    }

    // Check if we've already processed this symbol name
    // If two symbols have the same name, we assume they're the same symbol
    const libId = `Custom:${symbolName}`
    if (this.processedSymbolNames.has(libId)) {
      return null // Skip duplicate symbol definitions
    }
    this.processedSymbolNames.add(libId)

    // Build symbol data from schematic primitives linked to this schematic_symbol
    const symbolData = buildSymbolDataFromSchematicPrimitives({
      circuitJson: this.ctx.circuitJson,
      schematicSymbolId,
      schematicSymbol,
      schematicComponentId: schematicComponent.schematic_component_id,
    })

    // Get footprint name for symbol-footprint linkage
    const footprintName = getKicadCompatibleComponentName(
      sourceComp,
      cadComponent,
    )

    return this.createLibrarySymbol({
      libId,
      symbolData,
      isChip: false, // Custom symbols are not treated as generic chips
      schematicComponent,
      description: this.getDescription(sourceComp),
      keywords: this.getKeywords(sourceComp),
      fpFilters: this.getFpFilters(sourceComp, schematicSymbol.name),
      footprintRef: footprintName ? `tscircuit:${footprintName}` : "",
      referencePrefix: getReferencePrefixForComponent(sourceComp),
      symbolScale: 1, // Custom symbols are already at KiCad-appropriate scale
    })
  }

  /**
   * Create library symbol for a schematic net label with symbol_name
   */
  private createLibrarySymbolForNetLabel({
    netLabel,
    isPower,
    isGround,
  }: {
    netLabel: SchematicNetLabel
    isPower: boolean
    isGround: boolean
  }): SchematicSymbol | null {
    const symbolName = netLabel.symbol_name
    if (!symbolName) return null

    const symbolData = symbols[symbolName as keyof typeof symbols]
    if (!symbolData) return null

    const libId = `Custom:${symbolName}`

    return this.createLibrarySymbol({
      libId,
      symbolData,
      isChip: false,
      schematicComponent: undefined,
      description: isPower
        ? "Power net label"
        : isGround
          ? "Ground net label"
          : "Net symbol",
      keywords: isPower ? "power net" : isGround ? "ground net" : "net",
      fpFilters: "",
      referencePrefix: libId.split(":")[1]?.[0] || "U",
    })
  }

  /**
   * Get symbol data from schematic-symbols or generate for generic chips
   */
  private getSymbolData(
    symbolName: string,
    schematicComponent: SchematicComponent,
  ): any {
    if (symbolName.startsWith("generic_chip_")) {
      return createGenericChipSymbolData(schematicComponent, this.ctx.db)
    }

    return symbols[symbolName as keyof typeof symbols] || null
  }

  /**
   * Create a KiCad library symbol from symbol data
   * This is the core method that handles both components and net labels
   */
  private createLibrarySymbol({
    libId,
    symbolData,
    isChip,
    schematicComponent,
    description,
    keywords,
    fpFilters,
    footprintRef = "",
    referencePrefix,
    symbolScale,
  }: {
    libId: string
    symbolData: any
    isChip: boolean
    schematicComponent?: SchematicComponent
    description: string
    keywords: string
    fpFilters: string
    footprintRef?: string
    referencePrefix?: string
    symbolScale?: number
  }): SchematicSymbol {
    const CIRCUIT_JSON_SCALE_FACTOR = 15
    const c2kMatSchScale =
      symbolScale ?? this.ctx.c2kMatSch?.a ?? CIRCUIT_JSON_SCALE_FACTOR
    const symbol = new SchematicSymbol({
      libraryId: libId,
      excludeFromSim: false,
      inBom: true,
      onBoard: true,
    })

    // Setup pin numbers
    const pinNumbers = new SymbolPinNumbers()
    // For chips, show pin numbers (outside); for other components, hide them
    pinNumbers.hide = !isChip
    symbol._sxPinNumbers = pinNumbers

    // Setup pin names
    const pinNames = new SymbolPinNames()
    // For chips, use larger offset to position names well inside; for others, use 0
    pinNames.offset = isChip ? 1.27 : 0
    symbol._sxPinNames = pinNames

    // Add properties
    addSymbolProperties({
      symbol,
      libId,
      description,
      keywords,
      fpFilters,
      footprintRef,
      referencePrefix,
    })

    // Create drawing subsymbol (unit 0, 1)
    const drawingSymbol = createDrawingSubsymbol({
      libId,
      symbolData,
      isChip,
      c2kMatSchScale,
    })
    symbol.subSymbols.push(drawingSymbol)

    // Create pin subsymbol (unit 1, 1)
    const pinSymbol = createPinSubsymbol({
      libId,
      symbolData,
      isChip,
      schematicComponent,
      schematicPorts: this.ctx.db.schematic_port.list(),
      c2kMatSchScale,
    })
    symbol.subSymbols.push(pinSymbol)

    // Set embedded_fonts
    symbol._sxEmbeddedFonts = new EmbeddedFonts(false)

    return symbol
  }

  private getDescription(sourceComp: any): string {
    if (sourceComp?.ftype === "simple_resistor") return "Resistor"
    if (sourceComp?.ftype === "simple_capacitor") return "Capacitor"
    if (sourceComp?.ftype === "simple_chip") return "Integrated Circuit"
    return "Component"
  }

  private getKeywords(sourceComp: any): string {
    if (sourceComp?.ftype === "simple_resistor") return "R res resistor"
    if (sourceComp?.ftype === "simple_capacitor") return "C cap capacitor"
    if (sourceComp?.ftype === "simple_chip") return "U IC chip"
    return ""
  }

  private getFpFilters(sourceComp: any, symbolName?: string): string {
    // For custom symbols with an explicit name, use that name with wildcard
    // This allows matching footprint variants like MachineContactLarge, MachineContactMedium
    if (symbolName) {
      return `${symbolName}*`
    }
    if (sourceComp?.ftype === "simple_resistor") return "R_*"
    if (sourceComp?.ftype === "simple_capacitor") return "C_*"
    if (sourceComp?.ftype === "simple_chip") return "*"
    return "*"
  }

  override getOutput(): KicadSch {
    if (!this.ctx.kicadSch) {
      throw new Error("kicadSch is not initialized")
    }
    return this.ctx.kicadSch
  }
}
