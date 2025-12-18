import type {
  CircuitJson,
  SchematicNetLabel,
  SchematicComponent,
  SourceComponentBase,
} from "circuit-json"
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
import { applyToPoint, scale as createScaleMatrix } from "transformation-matrix"

/**
 * Adds library symbol definitions from schematic-symbols to the lib_symbols section
 */
export class AddLibrarySymbolsStage extends ConverterStage<
  CircuitJson,
  KicadSch
> {
  override _step(): void {
    const { kicadSch, db } = this.ctx

    // Create lib_symbols section
    const libSymbols = new LibSymbols()
    const librarySymbols: SchematicSymbol[] = []

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
   * Create library symbol for a schematic component
   */
  private createLibrarySymbolForComponent(
    schematicComponent: SchematicComponent,
  ): SchematicSymbol | null {
    const { db } = this.ctx

    const sourceComp = schematicComponent.source_component_id
      ? db.source_component.get(schematicComponent.source_component_id)
      : null

    if (!sourceComp) return null

    const symbolName =
      schematicComponent.symbol_name ||
      (sourceComp.ftype === "simple_chip"
        ? `generic_chip_${schematicComponent.source_component_id}`
        : null)

    if (!symbolName) return null

    const symbolData = this.getSymbolData(symbolName, schematicComponent)
    if (!symbolData) return null

    const libId = getLibraryId(sourceComp, schematicComponent)
    const isChip = sourceComp.ftype === "simple_chip"

    // Get footprint name for symbol-footprint linkage
    const footprintName = sourceComp.ftype || ""

    return this.createLibrarySymbol({
      libId,
      symbolData,
      isChip,
      schematicComponent,
      description: this.getDescription(sourceComp),
      keywords: this.getKeywords(sourceComp),
      fpFilters: this.getFpFilters(sourceComp),
      footprintRef: footprintName ? `tscircuit:${footprintName}` : "",
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
      return this.createGenericChipSymbolData(schematicComponent, this.ctx.db)
    }

    return symbols[symbolName as keyof typeof symbols] || null
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
  }: {
    libId: string
    symbolData: any
    isChip: boolean
    schematicComponent?: SchematicComponent
    description: string
    keywords: string
    fpFilters: string
    footprintRef?: string
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
    symbol._sxPinNames = pinNames

    // Add properties
    this.addSymbolProperties({
      symbol,
      libId,
      description,
      keywords,
      fpFilters,
      footprintRef,
    })

    // Create drawing subsymbol (unit 0, 1)
    const drawingSymbol = this.createDrawingSubsymbol({
      libId,
      symbolData,
      isChip,
    })
    symbol.subSymbols.push(drawingSymbol)

    // Create pin subsymbol (unit 1, 1)
    const pinSymbol = this.createPinSubsymbol({
      libId,
      symbolData,
      isChip,
      schematicComponent,
    })
    symbol.subSymbols.push(pinSymbol)

    // Set embedded_fonts
    symbol._sxEmbeddedFonts = new EmbeddedFonts(false)

    return symbol
  }

  /**
   * Add properties to the library symbol
   */
  private addSymbolProperties({
    symbol,
    libId,
    description,
    keywords,
    fpFilters,
    footprintRef = "",
  }: {
    symbol: SchematicSymbol
    libId: string
    description: string
    keywords: string
    fpFilters: string
    footprintRef?: string
  }): void {
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
        value: footprintRef,
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
        value: description,
        id: 4,
        at: [0, 0, 0],
        hide: true,
      },
      {
        key: "ki_keywords",
        value: keywords,
        id: 5,
        at: [0, 0, 0],
        hide: true,
      },
      {
        key: "ki_fp_filters",
        value: fpFilters,
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
  private createDrawingSubsymbol({
    libId,
    symbolData,
    isChip,
  }: {
    libId: string
    symbolData: any
    isChip: boolean
  }): SchematicSymbol {
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
        const polyline = this.createPolylineFromPoints({
          points: primitive.points,
          scale: symbolScale,
          center: symbolData.center,
          fillType: fillType,
        })
        drawingSymbol.polylines.push(polyline)
      }
      // Note: schematic-symbols typically uses paths, not box primitives
    }

    return drawingSymbol
  }

  /**
   * Create a KiCad polyline from points
   */
  private createPolylineFromPoints({
    points,
    scale,
    center,
    fillType,
  }: {
    points: Array<{ x: number; y: number }>
    scale: number
    center: { x: number; y: number } | undefined
    fillType: "none" | "background"
  }): SymbolPolyline {
    const polyline = new SymbolPolyline()

    // Scale points to match the c2kMatSch transformation scale
    const cx = center?.x ?? 0
    const cy = center?.y ?? 0

    // Use transformation matrix for scaling
    const scaleMatrix = createScaleMatrix(scale, scale)
    const xyPoints = points.map((p) => {
      const translated = applyToPoint(scaleMatrix, { x: p.x - cx, y: p.y - cy })
      return new Xy(translated.x, translated.y)
    })
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
  private createPinSubsymbol({
    libId,
    symbolData,
    isChip,
    schematicComponent,
  }: {
    libId: string
    symbolData: any
    isChip: boolean
    schematicComponent?: SchematicComponent
  }): SchematicSymbol {
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
        i,
        schematicComponent,
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
    portIndex?: number,
    schematicComponent?: SchematicComponent,
  ): { x: number; y: number; angle: number } {
    // Extract scale from transformation matrix
    const symbolScale = this.ctx.c2kMatSch?.a || 15

    // Get the actual port position from circuit JSON if available
    let portX = port.x ?? 0
    let portY = port.y ?? 0
    let usingCircuitJsonPort = false

    if (portIndex !== undefined && schematicComponent) {
      const schematicPorts = this.ctx.db.schematic_port
        .list()
        .filter(
          (p: any) =>
            p.schematic_component_id ===
            schematicComponent.schematic_component_id,
        )
        .sort((a: any, b: any) => (a.pin_number || 0) - (b.pin_number || 0))

      if (schematicPorts[portIndex]) {
        const schPort = schematicPorts[portIndex]
        // Use circuit JSON schematic_port position relative to component center
        // These are already relative to component center, no need to subtract template center
        portX = schPort.center.x - schematicComponent.center.x
        portY = schPort.center.y - schematicComponent.center.y
        usingCircuitJsonPort = true
      }
    }

    let dx: number
    let dy: number
    if (usingCircuitJsonPort) {
      // Circuit JSON positions are already relative to component center
      dx = portX
      dy = portY
    } else {
      // Template positions need center subtraction
      const cx = center?.x ?? 0
      const cy = center?.y ?? 0
      dx = portX - cx
      dy = portY - cy
    }

    // Use transformation matrix to scale the point
    const scaleMatrix = createScaleMatrix(symbolScale, symbolScale)
    const scaled = applyToPoint(scaleMatrix, { x: dx, y: dy })
    // Determine pin orientation FIRST (before scaling/snapping)
    // For chips with size info, use normalized distances to handle non-square components
    let isHorizontalPin: boolean
    if (isChip && size) {
      // Use normalized distances: compare distance as a fraction of half-width vs half-height
      const halfWidth = size.width / 2
      const halfHeight = size.height / 2
      const normalizedDx = Math.abs(dx) / halfWidth
      const normalizedDy = Math.abs(dy) / halfHeight
      isHorizontalPin = normalizedDx > normalizedDy
    } else {
      // Fallback for non-chips or when size is unavailable
      isHorizontalPin = Math.abs(dx) > Math.abs(dy)
    }

    let x = scaled.x
    let y = scaled.y

    // Pin length for chips
    const chipPinLength = 6.0

    // For chips, adjust pin position to be at the box edge
    if (isChip && size) {
      const halfWidth = (size.width / 2) * symbolScale
      const halfHeight = (size.height / 2) * symbolScale

      // Snap pins to edges based on orientation (use isHorizontalPin, not raw dx/dy)
      if (isHorizontalPin) {
        // Horizontal pin - snap x to edge, keep y
        x = dx > 0 ? halfWidth : -halfWidth
        y = dy * symbolScale
      } else {
        // Vertical pin - snap y to edge, keep x
        x = dx * symbolScale
        y = dy > 0 ? halfHeight : -halfHeight
      }
    }

    // Determine pin angle based on orientation
    let angle = 0
    if (isHorizontalPin) {
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
