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
import { getLibraryId } from "../getLibraryId"

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
    const librarySymbols: SchematicSymbol[] = []

    // Create a symbol for each component instance
    for (const schematicComponent of schematicComponents) {
      const sourceComp = schematicComponent.source_component_id
        ? db.source_component.get(schematicComponent.source_component_id)
        : null

      if (!sourceComp) continue

      const symbolName =
        schematicComponent.symbol_name ||
        (sourceComp.ftype === "simple_chip"
          ? `generic_chip_${schematicComponent.source_component_id}`
          : null)

      if (!symbolName) {
        continue
      }

      let symbolData

      if (symbolName.startsWith("generic_chip_")) {
        symbolData = this.createGenericChipSymbolData(schematicComponent, db)
      } else {
        symbolData = symbols[symbolName as keyof typeof symbols]
        if (!symbolData) {
          continue
        }
      }

      const libSymbol = this.createLibrarySymbolFromSchematicSymbol(
        symbolName,
        symbolData,
        sourceComp,
        schematicComponent,
      )
      librarySymbols.push(libSymbol)
    }

    libSymbols.symbols = librarySymbols
    if (kicadSch) {
      kicadSch.libSymbols = libSymbols
    }

    this.finished = true
  }

  /**
   * Create generic chip symbol data for chips without a symbol_name
   */
  private createGenericChipSymbolData(schematicComp: any, db: any): any {
    // Get all ports for this component
    const schematicPorts = db.schematic_port
      .list()
      .filter(
        (p: any) =>
          p.schematic_component_id === schematicComp.schematic_component_id,
      )
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
    schematicComp: any,
  ): SchematicSymbol {
    // Use Device:R as the library ID for now (we can make this more sophisticated later)
    const libId = getLibraryId(sourceComp, schematicComp)

    const symbol = new SchematicSymbol({
      libraryId: libId,
      excludeFromSim: false,
      inBom: true,
      onBoard: true,
    })

    // Setup pin numbers
    const pinNumbers = new SymbolPinNumbers()
    // For chips, show pin numbers (outside); for other components, hide them
    pinNumbers.hide = sourceComp?.ftype !== "simple_chip"
    symbol._sxPinNumbers = pinNumbers

    // Setup pin names
    const pinNames = new SymbolPinNames()
    // For chips, use larger offset to position names well inside; for others, use 0
    pinNames.offset = sourceComp?.ftype === "simple_chip" ? 1.27 : 0
    symbol._sxPinNames = pinNames

    // Add properties
    this.addSymbolProperties(symbol, libId, sourceComp)

    // Create drawing subsymbol (unit 0, 1)
    const isChip = sourceComp?.ftype === "simple_chip"
    const drawingSymbol = this.createDrawingSubsymbol(libId, symbolData, isChip)
    symbol.subSymbols.push(drawingSymbol)

    // Create pin subsymbol (unit 1, 1)
    const pinSymbol = this.createPinSubsymbol(libId, symbolData, isChip)
    symbol.subSymbols.push(pinSymbol)

    // Set embedded_fonts
    symbol._sxEmbeddedFonts = new EmbeddedFonts(false)

    return symbol
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
    isChip: boolean = false,
  ): SchematicSymbol {
    const drawingSymbol = new SchematicSymbol({
      libraryId: `${libId.split(":")[1]}_0_1`,
    })

    // Convert schematic-symbols primitives to KiCad drawing elements
    // Scale symbols by the same factor as positions (from c2kMatSch) so they match the layout
    const symbolScale = this.ctx.c2kMatSch?.a || 15 // Extract scale from transformation matrix

    for (const primitive of symbolData.primitives || []) {
      if (primitive.type === "path" && primitive.points) {
        // Use background fill for chip boxes to get yellow background
        const fillType = isChip ? "background" : "none"
        const polyline = this.createPolylineFromPoints(
          primitive.points,
          symbolScale,
          fillType,
        )
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
    fillType: "none" | "background" = "none",
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

    // Set fill type
    const fill = new SymbolPolylineFill()
    fill.type = fillType
    polyline.fill = fill

    return polyline
  }

  /**
   * Create the pin subsymbol
   */
  private createPinSubsymbol(
    libId: string,
    symbolData: any,
    isChip: boolean = false,
  ): SchematicSymbol {
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
      const { x, y, angle } = this.calculatePinPosition(
        port,
        symbolData.center,
        symbolData.size,
        isChip,
      )
      pin.at = [x, y, angle]
      // For chips, use longer pins (2.54); for other components, use 1.27
      pin.length = isChip ? 6.0 : 1.27

      // Pin name - use the label from the port
      const nameFont = new TextEffectsFont()
      nameFont.size = { height: 1.27, width: 1.27 }
      const nameEffects = new TextEffects({ font: nameFont })
      const pinName = port.labels?.[0] || "~"
      pin._sxName = new SymbolPinName({ value: pinName, effects: nameEffects })

      // Pin number
      const numFont = new TextEffectsFont()
      numFont.size = { height: 1.27, width: 1.27 }
      const numEffects = new TextEffects({ font: numFont })
      const pinNum = port.pinNumber?.toString() || `${i + 1}`
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
    size?: any,
    isChip?: boolean,
  ): { x: number; y: number; angle: number } {
    // Extract scale from transformation matrix
    const symbolScale = this.ctx.c2kMatSch?.a || 15

    // Calculate position relative to center
    const dx = port.x - center.x
    const dy = port.y - center.y

    let x = port.x * symbolScale
    let y = port.y * symbolScale

    // Pin length for chips
    const chipPinLength = 6.0

    // For chips, adjust pin position to be at the box edge
    if (isChip && size) {
      const halfWidth = (size.width / 2) * symbolScale
      const halfHeight = (size.height / 2) * symbolScale

      // Determine which edge the pin is on and snap to that edge
      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal pin - snap x to edge, keep y
        x = dx > 0 ? halfWidth : -halfWidth
        y = dy * symbolScale
      } else {
        // Vertical pin - snap y to edge, keep x
        x = dx * symbolScale
        y = dy > 0 ? halfHeight : -halfHeight
      }
    }

    // Determine pin angle based on which side of the component
    let angle = 0
    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal pin
      if (dx > 0) {
        // Right side
        if (isChip) {
          // For chips: pin starts outside box, points inward (left)
          angle = 180
          x = x + chipPinLength // Move pin start position outward
        } else {
          // For other components: pin points outward (right)
          angle = 0
        }
      } else {
        // Left side
        if (isChip) {
          // For chips: pin starts outside box, points inward (right)
          angle = 0
          x = x - chipPinLength // Move pin start position outward
        } else {
          // For other components: pin points outward (left)
          angle = 180
        }
      }
    } else {
      // Vertical pin
      if (dy > 0) {
        // Top side
        if (isChip) {
          // For chips: pin starts outside box, points inward (down)
          angle = 270
          y = y + chipPinLength // Move pin start position outward
        } else {
          // For other components: pin points outward (up)
          angle = 90
        }
      } else {
        // Bottom side
        if (isChip) {
          // For chips: pin starts outside box, points inward (up)
          angle = 90
          y = y - chipPinLength // Move pin start position outward
        } else {
          // For other components: pin points outward (down)
          angle = 270
        }
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
    if (!this.ctx.kicadSch) {
      throw new Error("kicadSch is not initialized")
    }
    return this.ctx.kicadSch
  }
}
