import type {
  CircuitJson,
  SchematicComponent,
  SchematicNetLabel,
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
  SymbolPower,
} from "kicadts"
import { symbols } from "schematic-symbols"
import { ConverterStage } from "../../types"
import {
  getKicadCompatibleComponentName,
  getReferencePrefixForComponent,
} from "../../utils/getKicadCompatibleComponentName"
import { getSchematicSymbolData } from "../getSchematicSymbolData"
import {
  type ResolvedSchematicComponentSymbol,
  resolveSchematicComponentSymbol,
} from "../resolveSchematicComponentSymbol"
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
  private symbolDefinitionsByLibId = new Map<string, Map<string, string>>()
  private reservedLibraryIds = new Set<string>()
  private usedLibraryIds = new Set<string>()

  override _step(): void {
    const { kicadSch, db } = this.ctx

    // Create lib_symbols section
    const libSymbols = new LibSymbols()
    const librarySymbols: SchematicSymbol[] = []

    this.symbolDefinitionsByLibId.clear()
    this.ctx.schematicComponentLibraryIds = new Map()

    const componentSymbols = db.schematic_component
      .list()
      .flatMap((component) => {
        const symbol = this.createLibrarySymbolForComponent(component)
        return symbol ? [{ component, symbol }] : []
      })
    const railSymbols: SchematicSymbol[] = []

    // Rail artwork is shared, while each instance's Value names its global net.
    const netLabels = db.schematic_net_label?.list?.() || []
    const railLibraryIds = new Set<string>()
    for (const netLabel of netLabels) {
      if (!netLabel.symbol_name || railLibraryIds.has(netLabel.symbol_name))
        continue
      const sourceNet = netLabel.source_net_id
        ? db.source_net.get(netLabel.source_net_id)
        : undefined
      const libSymbol = this.createLibrarySymbolForNetLabel({
        netLabel,
        isPower: sourceNet?.is_power ?? false,
        isGround: sourceNet?.is_ground ?? false,
      })
      if (libSymbol) {
        railSymbols.push(libSymbol)
        railLibraryIds.add(netLabel.symbol_name)
      }
    }

    // Reserve all source names before assigning suffixes: a variant of Shared
    // must not take the ID of an actual symbol named Shared_2. Rails retain the
    // fixed IDs used by AddSchematicNetLabelsStage.
    this.reservedLibraryIds = new Set([
      ...componentSymbols.map(({ symbol }) => symbol.libraryId!),
      ...railSymbols.map((symbol) => symbol.libraryId!),
    ])
    this.usedLibraryIds = new Set(
      railSymbols.map((symbol) => symbol.libraryId!),
    )
    const emittedLibraryIds = new Set<string>()
    for (const { component, symbol } of componentSymbols) {
      const originalId = symbol.libraryId!
      const libraryId = this.getLibraryIdForSymbolDefinition(originalId, symbol)
      this.ctx.schematicComponentLibraryIds.set(
        component.schematic_component_id,
        libraryId,
      )
      if (emittedLibraryIds.has(libraryId)) continue
      emittedLibraryIds.add(libraryId)
      if (libraryId !== originalId) {
        symbol.libraryId = libraryId
        for (const unit of symbol.subSymbols) {
          unit.libraryId =
            libraryId.split(":")[1] +
            unit.libraryId!.slice(originalId.split(":")[1]!.length)
        }
      }
      librarySymbols.push(symbol)
    }
    librarySymbols.push(...railSymbols)

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

    const symbolContext = resolveSchematicComponentSymbol({
      circuitJson: this.ctx.circuitJson,
      schematicComponent,
      sourceComponent: sourceComp,
      cadComponents: db.cad_component?.list?.() ?? [],
    })
    const {
      cadComponent,
      schematicSymbolId,
      usesComponentLevelSymbolPrimitives,
      libraryId,
      isChip,
    } = symbolContext

    if (schematicSymbolId) {
      return this.createLibrarySymbolFromSchematicSymbol(
        schematicComponent,
        sourceComp,
        symbolContext,
      )
    }

    if (usesComponentLevelSymbolPrimitives) {
      const innerSymbolData = buildSymbolDataFromSchematicPrimitives({
        circuitJson: this.ctx.circuitJson,
        schematicComponentId: schematicComponent.schematic_component_id,
        schematicComponentCenter: schematicComponent.center,
        schematicComponentSize: schematicComponent.size,
        schematicSymbol: {
          center: schematicComponent.center,
          size: schematicComponent.size,
        },
      })

      if (innerSymbolData.primitives?.length > 0) {
        const symbolData = {
          ...innerSymbolData,
          // Imported symbol text is emitted as standalone schematic text.
          texts: [],
        }

        const footprintName = getKicadCompatibleComponentName(
          sourceComp,
          cadComponent,
        )
        let footprintRef = ""
        if (footprintName) {
          footprintRef = `tscircuit:${footprintName}`
        }

        return this.createLibrarySymbol({
          libId: libraryId,
          symbolData,
          isChip: false,
          hidePinNames: true,
          schematicComponent,
          description: this.getDescription(sourceComp),
          keywords: this.getKeywords(sourceComp),
          fpFilters: this.getFpFilters(sourceComp),
          footprintRef,
          referencePrefix: getReferencePrefixForComponent(sourceComp),
          symbolScale: this.ctx.kicadSchematicScaleFactor!,
        })
      }
    }

    const symbolName =
      schematicComponent.symbol_name ||
      (sourceComp.ftype === "simple_chip" ||
      sourceComp.ftype === "simple_pin_header" ||
      sourceComp.ftype === "simple_connector"
        ? `generic_chip_${schematicComponent.source_component_id}`
        : null)

    if (!symbolName) return null

    const symbolData = this.getSymbolData(symbolName, schematicComponent)
    if (!symbolData) return null

    // Get footprint name for symbol-footprint linkage using ergonomic naming
    const footprintName = getKicadCompatibleComponentName(
      sourceComp,
      cadComponent,
    )

    const librarySymbolOptions = {
      symbolData,
      isChip,
      schematicComponent,
      description: this.getDescription(sourceComp),
      keywords: this.getKeywords(sourceComp),
      fpFilters: this.getFpFilters(sourceComp),
      footprintRef: footprintName ? `tscircuit:${footprintName}` : "",
      referencePrefix: getReferencePrefixForComponent(sourceComp),
      symbolScale: this.ctx.kicadSchematicScaleFactor!,
    }
    return this.createLibrarySymbol({
      libId: libraryId,
      ...librarySymbolOptions,
    })
  }

  /**
   * KiCad resolves every instance of a lib id through a single definition and
   * joins symbol pins to wires by position and footprint pads by number.
   * Components may share a lib id only when their drawings and pin definitions
   * agree, including pin names, numbers, positions, directions and library
   * properties such as the footprint and pin visibility.
   */
  private getLibraryIdForSymbolDefinition(
    libId: string,
    librarySymbol: SchematicSymbol,
  ): string {
    const definition = librarySymbol.getString()
    const definitions =
      this.symbolDefinitionsByLibId.get(libId) ?? new Map<string, string>()
    this.symbolDefinitionsByLibId.set(libId, definitions)
    const existingId = definitions.get(definition)
    if (existingId) return existingId

    let resolvedId = libId
    let suffix = 2
    if (this.usedLibraryIds.has(resolvedId)) {
      do {
        resolvedId = `${libId}_${suffix++}`
      } while (
        this.reservedLibraryIds.has(resolvedId) ||
        this.usedLibraryIds.has(resolvedId)
      )
    }
    this.usedLibraryIds.add(resolvedId)
    definitions.set(definition, resolvedId)
    return resolvedId
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
    symbolContext: ResolvedSchematicComponentSymbol,
  ): SchematicSymbol | null {
    const { cadComponent, schematicSymbol, schematicSymbolId, libraryId } =
      symbolContext

    if (!schematicSymbol || !schematicSymbolId) {
      // Fall back to standard symbol handling if schematic_symbol not found
      return null
    }

    // Build symbol data from schematic primitives linked to this schematic_symbol
    const symbolData = buildSymbolDataFromSchematicPrimitives({
      circuitJson: this.ctx.circuitJson,
      schematicSymbolId,
      schematicSymbol,
      schematicComponentId: schematicComponent.schematic_component_id,
      schematicComponentCenter: schematicComponent.center,
      schematicComponentSize: schematicComponent.size,
    })

    // Core resolves {REF} to the component name. Render that label using the
    // placed symbol's Reference field instead of baking it into shared artwork.
    if (sourceComp.name) {
      const referenceTextIndex = symbolData.texts.findIndex(
        (text) => text.text === sourceComp.name,
      )
      if (referenceTextIndex !== -1) {
        symbolData.texts.splice(referenceTextIndex, 1)
      }
    }

    // Get footprint name for symbol-footprint linkage
    const footprintName = getKicadCompatibleComponentName(
      sourceComp,
      cadComponent,
    )

    return this.createLibrarySymbol({
      libId: libraryId,
      symbolData,
      isChip: false, // Custom symbols are not treated as generic chips
      schematicComponent,
      description: this.getDescription(sourceComp),
      keywords: this.getKeywords(sourceComp),
      fpFilters: this.getFpFilters(sourceComp, schematicSymbol.name),
      footprintRef: footprintName ? `tscircuit:${footprintName}` : "",
      referencePrefix: getReferencePrefixForComponent(sourceComp),
      symbolScale: this.ctx.kicadSchematicScaleFactor!,
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

    const symbol = this.createLibrarySymbol({
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
      referencePrefix: "#PWR",
      symbolScale: this.ctx.kicadSchematicScaleFactor!,
    })
    symbol._sxPower = new SymbolPower("global")
    symbol.inBom = false
    symbol.onBoard = false
    for (const unit of symbol.subSymbols) {
      for (const pin of unit.pins) pin.pinElectricalType = "power_in"
    }
    return symbol
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

    return getSchematicSymbolData(symbolName) || null
  }

  /**
   * Create a KiCad library symbol from symbol data
   * This is the core method that handles both components and net labels
   */
  private createLibrarySymbol({
    libId,
    symbolData,
    isChip,
    hidePinNames = false,
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
    hidePinNames?: boolean
    schematicComponent?: SchematicComponent
    description: string
    keywords: string
    fpFilters: string
    footprintRef?: string
    referencePrefix?: string
    symbolScale: number
  }): SchematicSymbol {
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
    if (hidePinNames) pinNames.hide = true
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
      c2kMatSchScale: symbolScale,
    })
    symbol.subSymbols.push(drawingSymbol)

    // Create pin subsymbol (unit 1, 1)
    const pinSymbol = createPinSubsymbol({
      libId,
      symbolData,
      isChip,
      schematicComponent,
      schematicPorts: this.ctx.db.schematic_port.list(),
      sourcePorts: this.ctx.db.source_port.list(),
      c2kMatSchScale: symbolScale,
      c2kMatSch: this.ctx.c2kMatSch,
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
    if (sourceComp?.ftype === "simple_connector") return "Connector"
    return "Component"
  }

  private getKeywords(sourceComp: any): string {
    if (sourceComp?.ftype === "simple_resistor") return "R res resistor"
    if (sourceComp?.ftype === "simple_capacitor") return "C cap capacitor"
    if (sourceComp?.ftype === "simple_chip") return "U IC chip"
    if (sourceComp?.ftype === "simple_connector") return "connector"
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
    if (sourceComp?.ftype === "simple_connector") return "*"
    return "*"
  }

  override getOutput(): KicadSch {
    if (!this.ctx.kicadSch) {
      throw new Error("kicadSch is not initialized")
    }
    return this.ctx.kicadSch
  }
}
