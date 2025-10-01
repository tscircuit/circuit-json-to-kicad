import type { CircuitJson, SourceSimpleResistor } from "circuit-json"
import type { KicadSch } from "kicadts"
import {
  EmbeddedFonts,
  LibSymbols,
  Pts,
  SchematicSymbol,
  Stroke,
  SymbolPin,
  SymbolPinName,
  SymbolPinNames,
  SymbolPinNumber,
  SymbolPinNumbers,
  SymbolPolyline,
  SymbolPolylineFill,
  SymbolProperty,
  TextEffects,
  TextEffectsFont,
  Xy,
} from "kicadts"
import { ConverterStage } from "../../types"
import { symbols } from "schematic-symbols"

/**
 * Adds library symbol definitions from schematic-symbols to the lib_symbols section
 */
export class AddLibrarySymbolsStage extends ConverterStage<
  CircuitJson,
  KicadSch
> {
  override _step(): void {
    const { kicadSch, db } = this.ctx

    // Get all schematic components with symbol names
    const schematicComponents = db.schematic_component.list()

    if (schematicComponents.length === 0) {
      this.finished = true
      return
    }

    // Create lib_symbols section
    const libSymbols = new LibSymbols()
    const symbolsToCreate = new Set<string>()

    // Collect unique symbol names
    // Also create symbols for chips without symbol_name
    for (const comp of schematicComponents) {
      if (comp.symbol_name) {
        symbolsToCreate.add(comp.symbol_name)
      } else {
        // For components without symbol_name (like chips), create a generic box symbol
        const sourceComp = comp.source_component_id
          ? db.source_component.get(comp.source_component_id)
          : null
        if (sourceComp?.ftype === "simple_chip") {
          symbolsToCreate.add(`generic_chip_${comp.source_component_id}`)
        }
      }
    }

    const librarySymbols: SchematicSymbol[] = []

    // Create a symbol for each unique symbol_name
    for (const symbolName of symbolsToCreate) {
      let symbolData = symbols[symbolName as keyof typeof symbols]
      let exampleComp
      let sourceComp

      // Check if this is a generic chip symbol
      if (symbolName.startsWith("generic_chip_")) {
        const sourceCompId = symbolName.replace("generic_chip_", "")
        sourceComp = db.source_component.get(sourceCompId)
        exampleComp = schematicComponents.find(
          (c) => c.source_component_id === sourceCompId,
        )

        // Create generic box symbol data based on the schematic component
        if (exampleComp) {
          symbolData = this.createGenericChipSymbolData(exampleComp, db)
        }
      } else {
        symbolData = symbols[symbolName as keyof typeof symbols]
        if (!symbolData) {
          console.warn(`Symbol ${symbolName} not found in schematic-symbols`)
          continue
        }

        // Find a component using this symbol to get metadata
        exampleComp = schematicComponents.find(
          (c) => c.symbol_name === symbolName,
        )
        sourceComp =
          exampleComp && exampleComp.source_component_id
            ? db.source_component.get(exampleComp.source_component_id)
            : null
      }

      const libSymbol = this.createLibrarySymbolFromSchematicSymbol(
        symbolName,
        symbolData,
        sourceComp,
      )
      librarySymbols.push(libSymbol)
    }

    libSymbols.symbols = librarySymbols
    kicadSch.libSymbols = libSymbols

    this.finished = true
  }

  /**
   * Create generic chip symbol data for chips without a symbol_name
   */
  private createGenericChipSymbolData(schematicComp: any, db: any): any {
    // Get all ports for this component
    const schematicPorts = db.schematic_port
      .list()
      .filter((p: any) => p.schematic_component_id === schematicComp.schematic_component_id)
      .sort((a: any, b: any) => (a.pin_number || 0) - (b.pin_number || 0))

    // Create box primitives based on component size
    const width = schematicComp.size?.width || 1.5
    const height = schematicComp.size?.height || 1

    const boxPath = {
      type: "path",
      points: [
        { x: -width / 2, y: -height / 2 },
        { x: width / 2, y: -height / 2 },
        { x: width / 2, y: height / 2 },
        { x: -width / 2, y: height / 2 },
        { x: -width / 2, y: -height / 2 },
      ],
    }

    // Create ports from schematic ports
    const ports = schematicPorts.map((port: any) => {
      // Get port position relative to component center
      const portX = port.center.x - schematicComp.center.x
      const portY = port.center.y - schematicComp.center.y

      return {
        x: portX,
        y: portY,
        labels: [port.display_pin_label || `${port.pin_number || 1}`],
        pinNumber: port.pin_number || 1,
      }
    })

    return {
      center: { x: 0, y: 0 },
      primitives: [boxPath],
      ports: ports,
      size: { width, height },
    }
  }

  /**
   * Convert schematic-symbols data to KiCad library symbol
   */
  private createLibrarySymbolFromSchematicSymbol(
    symbolName: string,
    symbolData: any,
    sourceComp: any,
  ): SchematicSymbol {
    // Use Device:R as the library ID for now (we can make this more sophisticated later)
    const libId = this.getLibraryId(symbolName, sourceComp)

    const symbol = new SchematicSymbol({
      libraryId: libId,
      excludeFromSim: false,
      inBom: true,
      onBoard: true,
    })

    // Setup pin numbers (hide)
    const pinNumbers = new SymbolPinNumbers()
    pinNumbers.hide = true
    symbol._sxPinNumbers = pinNumbers

    // Setup pin names (offset 0)
    const pinNames = new SymbolPinNames()
    pinNames.offset = 0
    symbol._sxPinNames = pinNames

    // Add properties
    this.addSymbolProperties(symbol, libId, sourceComp)

    // Create drawing subsymbol (unit 0, 1)
    const drawingSymbol = this.createDrawingSubsymbol(libId, symbolData)
    symbol.subSymbols.push(drawingSymbol)

    // Create pin subsymbol (unit 1, 1)
    const pinSymbol = this.createPinSubsymbol(libId, symbolData)
    symbol.subSymbols.push(pinSymbol)

    // Set embedded_fonts
    symbol._sxEmbeddedFonts = new EmbeddedFonts(false)

    return symbol
  }

  /**
   * Get KiCad library ID for a symbol
   */
  private getLibraryId(symbolName: string, sourceComp: any): string {
    // Map common component types to KiCad library IDs
    if (sourceComp?.ftype === "simple_resistor") {
      return "Device:R"
    }
    if (sourceComp?.ftype === "simple_capacitor") {
      return "Device:C"
    }
    if (sourceComp?.ftype === "simple_chip") {
      return "Device:U"
    }
    // Default: use a generic name
    return `Custom:${symbolName}`
  }

  /**
   * Add properties to the library symbol
   */
  private addSymbolProperties(
    symbol: SchematicSymbol,
    libId: string,
    sourceComp: any,
  ): void {
    const refPrefix = libId.split(":")[1]?.[0] || "U"

    const properties = [
      {
        key: "Reference",
        value: refPrefix,
        id: 0,
        at: [2.032, 0, 90],
        hide: false,
      },
      { key: "Value", value: refPrefix, id: 1, at: [0, 0, 90], hide: false },
      {
        key: "Footprint",
        value: "",
        id: 2,
        at: [-1.778, 0, 90],
        hide: true,
      },
      {
        key: "Datasheet",
        value: "~",
        id: 3,
        at: [0, 0, 0],
        hide: true,
      },
      {
        key: "Description",
        value: this.getDescription(sourceComp),
        id: 4,
        at: [0, 0, 0],
        hide: true,
      },
      {
        key: "ki_keywords",
        value: this.getKeywords(sourceComp),
        id: 5,
        at: [0, 0, 0],
        hide: true,
      },
      {
        key: "ki_fp_filters",
        value: this.getFpFilters(sourceComp),
        id: 6,
        at: [0, 0, 0],
        hide: true,
      },
    ]

    for (const prop of properties) {
      symbol.properties.push(
        new SymbolProperty({
          key: prop.key,
          value: prop.value,
          id: prop.id,
          at: prop.at as [number, number, number],
          effects: this.createTextEffects(1.27, prop.hide),
        }),
      )
    }
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

  private getFpFilters(sourceComp: any): string {
    if (sourceComp?.ftype === "simple_resistor") return "R_*"
    if (sourceComp?.ftype === "simple_capacitor") return "C_*"
    if (sourceComp?.ftype === "simple_chip") return "*"
    return "*"
  }

  /**
   * Create the drawing subsymbol (primitives, no pins)
   * Converts schematic-symbols primitives to KiCad drawing elements
   */
  private createDrawingSubsymbol(
    libId: string,
    symbolData: any,
  ): SchematicSymbol {
    const drawingSymbol = new SchematicSymbol({
      libraryId: `${libId.split(":")[1]}_0_1`,
    })

    // Convert schematic-symbols primitives to KiCad drawing elements
    // Scale symbols by the same factor as positions (from c2kMatSch) so they match the layout
    const symbolScale = this.ctx.c2kMatSch.a // Extract scale from transformation matrix

    for (const primitive of symbolData.primitives || []) {
      if (primitive.type === "path" && primitive.points) {
        const polyline = this.createPolylineFromPoints(primitive.points, symbolScale)
        drawingSymbol.polylines.push(polyline)
      }
      // Note: schematic-symbols typically uses paths, not box primitives
    }

    return drawingSymbol
  }

  /**
   * Create a KiCad polyline from points
   */
  private createPolylineFromPoints(
    points: Array<{ x: number; y: number }>,
    scale: number,
  ): SymbolPolyline {
    const polyline = new SymbolPolyline()

    // Scale points to match the c2kMatSch transformation scale
    const xyPoints = points.map((p) => new Xy(p.x * scale, p.y * scale))
    const pts = new Pts(xyPoints)
    polyline.points = pts

    // KiCad polylines need stroke (use primitive setters)
    const stroke = new Stroke()
    stroke.width = 0.254
    stroke.type = "default"
    polyline.stroke = stroke

    // Set fill to none
    const fill = new SymbolPolylineFill()
    fill.type = "none"
    polyline.fill = fill

    return polyline
  }

  /**
   * Create the pin subsymbol
   */
  private createPinSubsymbol(libId: string, symbolData: any): SchematicSymbol {
    const pinSymbol = new SchematicSymbol({
      libraryId: `${libId.split(":")[1]}_1_1`,
    })

    // Convert schematic-symbols ports to KiCad pins
    for (let i = 0; i < (symbolData.ports?.length || 0); i++) {
      const port = symbolData.ports[i]
      const pin = new SymbolPin()
      pin.pinElectricalType = "passive"
      pin.pinGraphicStyle = "line"

      // Calculate pin position and angle
      const { x, y, angle } = this.calculatePinPosition(port, symbolData.center)
      pin.at = [x, y, angle]
      pin.length = 1.27

      // Pin name
      const nameFont = new TextEffectsFont()
      nameFont.size = { height: 1.27, width: 1.27 }
      const nameEffects = new TextEffects({ font: nameFont })
      pin._sxName = new SymbolPinName({ value: "~", effects: nameEffects })

      // Pin number
      const numFont = new TextEffectsFont()
      numFont.size = { height: 1.27, width: 1.27 }
      const numEffects = new TextEffects({ font: numFont })
      const pinNum = port.pinNumber?.toString() || port.labels?.[0] || `${i + 1}`
      pin._sxNumber = new SymbolPinNumber({
        value: pinNum,
        effects: numEffects,
      })

      pinSymbol.pins.push(pin)
    }

    return pinSymbol
  }

  /**
   * Calculate KiCad pin position and rotation from schematic-symbols port
   * Scale pins to match the c2kMatSch transformation scale
   */
  private calculatePinPosition(
    port: any,
    center: any,
  ): { x: number; y: number; angle: number } {
    // Extract scale from transformation matrix
    const symbolScale = this.ctx.c2kMatSch.a

    // Calculate position relative to center
    const dx = port.x - center.x
    const dy = port.y - center.y

    // Scale position to match layout scale
    const x = port.x * symbolScale
    const y = port.y * symbolScale

    // Determine pin angle based on which side of the component
    let angle = 0
    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal pin
      if (dx > 0) {
        // Right side - pin points left (180°)
        angle = 180
      } else {
        // Left side - pin points right (0°)
        angle = 0
      }
    } else {
      // Vertical pin
      if (dy > 0) {
        // Top side - pin points down (270°)
        angle = 270
      } else {
        // Bottom side - pin points up (90°)
        angle = 90
      }
    }

    return { x, y, angle }
  }

  /**
   * Creates text effects for properties
   */
  private createTextEffects(size: number, hide: boolean): TextEffects {
    const font = new TextEffectsFont()
    font.size = { height: size, width: size }

    return new TextEffects({
      font: font,
      hiddenText: hide,
    })
  }

  override getOutput(): KicadSch {
    return this.ctx.kicadSch
  }
}
