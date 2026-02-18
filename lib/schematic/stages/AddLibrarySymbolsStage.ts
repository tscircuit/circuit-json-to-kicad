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
  Pts,
  SchematicSymbol,
  Stroke,
  SymbolCircle,
  SymbolCircleCenter,
  SymbolCircleFill,
  SymbolCircleRadius,
  SymbolPin,
  SymbolPinName,
  SymbolPinNames,
  SymbolPinNumber,
  SymbolPinNumbers,
  SymbolPolyline,
  SymbolPolylineFill,
  SymbolProperty,
  SymbolText,
  TextEffects,
  TextEffectsFont,
  Xy,
} from "kicadts"
import { ConverterStage } from "../../types"
import { symbols } from "schematic-symbols"
import { getLibraryId } from "../getLibraryId"
import {
  getKicadCompatibleComponentName,
  getReferencePrefixForComponent,
} from "../../utils/getKicadCompatibleComponentName"
import { applyToPoint, scale as createScaleMatrix } from "transformation-matrix"

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
    const symbolData = this.buildSymbolDataFromSchematicPrimitives(
      schematicSymbolId,
      schematicSymbol,
      schematicComponent.schematic_component_id,
    )

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
    })
  }

  /**
   * Build symbol data from schematic primitives (schematic_circle, schematic_line, schematic_path)
   * that are linked to a schematic_symbol via schematic_symbol_id.
   */
  private buildSymbolDataFromSchematicPrimitives(
    schematicSymbolId: string,
    schematicSymbol: any,
    schematicComponentId?: string,
  ): any {
    const { circuitJson } = this.ctx

    // Collect all primitives linked to this schematic_symbol
    const circles: any[] = circuitJson.filter(
      (el: any) =>
        el.type === "schematic_circle" &&
        el.schematic_symbol_id === schematicSymbolId,
    )
    // Collect lines with schematic_symbol_id (symbol body lines)
    const symbolLines: any[] = circuitJson.filter(
      (el: any) =>
        el.type === "schematic_line" &&
        el.schematic_symbol_id === schematicSymbolId,
    )
    // Also collect stem lines: lines with schematic_component_id but NO schematic_symbol_id
    // These are generated by schStemLength on ports
    const schLines: any[] = schematicComponentId
      ? circuitJson.filter(
          (el: any) =>
            el.type === "schematic_line" &&
            el.schematic_component_id === schematicComponentId &&
            !el.schematic_symbol_id,
        )
      : []
    const lines: any[] = [...symbolLines, ...schLines]
    const paths: any[] = circuitJson.filter(
      (el: any) =>
        el.type === "schematic_path" &&
        el.schematic_symbol_id === schematicSymbolId,
    )
    // Collect schematic_text elements for custom symbol text (e.g., +/- labels)
    const texts: any[] = circuitJson.filter(
      (el: any) =>
        el.type === "schematic_text" &&
        el.schematic_symbol_id === schematicSymbolId,
    )

    // Find ports - first try by schematic_symbol_id, then fall back to schematic_component_id
    // Note: schematic_symbol_id may not be in the SchematicPort type yet
    let ports = circuitJson.filter(
      (el): el is SchematicPort =>
        el.type === "schematic_port" &&
        "schematic_symbol_id" in el &&
        el.schematic_symbol_id === schematicSymbolId,
    )

    // If no ports found by symbol id, try to find by component id
    if (ports.length === 0 && schematicComponentId) {
      // First try: only include ports with display_pin_label (custom symbol ports like B, C, E)
      ports = circuitJson.filter(
        (el): el is SchematicPort =>
          el.type === "schematic_port" &&
          el.schematic_component_id === schematicComponentId &&
          el.display_pin_label !== undefined,
      )

      // Second try: if no ports with display_pin_label, get all ports and deduplicate by pin_number
      // This handles cases where custom symbol ports don't have display_pin_label (e.g., MachineContact)
      // The first port with each pin_number is kept (custom symbol port comes first in tscircuit output)
      if (ports.length === 0) {
        const allPorts = circuitJson.filter(
          (el): el is SchematicPort =>
            el.type === "schematic_port" &&
            el.schematic_component_id === schematicComponentId,
        )

        const seenPinNumbers = new Set<number>()
        ports = allPorts.filter((port) => {
          const pinNum = port.pin_number
          if (pinNum !== undefined) {
            if (seenPinNumbers.has(pinNum)) {
              return false // Skip duplicate
            }
            seenPinNumbers.add(pinNum)
          }
          return true
        })
      }
    }

    // Convert to internal primitive format
    const primitives: any[] = []

    // Convert schematic_circle to circle primitives
    for (const circle of circles) {
      primitives.push({
        type: "circle",
        x: circle.center?.x ?? 0,
        y: circle.center?.y ?? 0,
        radius: circle.radius ?? 0.5,
        fill: circle.is_filled ?? false,
        fillColor: circle.fill_color,
      })
    }

    // Convert schematic_line to path primitives (2-point paths)
    for (const line of lines) {
      primitives.push({
        type: "path",
        points: [
          { x: line.x1 ?? 0, y: line.y1 ?? 0 },
          { x: line.x2 ?? 0, y: line.y2 ?? 0 },
        ],
      })
    }

    // Convert schematic_path to path primitives
    for (const path of paths) {
      if (path.points && path.points.length > 0) {
        primitives.push({
          type: "path",
          points: path.points,
          fill: path.is_filled ?? false,
          fillColor: path.fill_color,
        })
      }
    }

    // Convert schematic_text to text primitives
    const symbolTexts = texts.map((text: any) => ({
      text: text.text ?? "",
      x: text.position?.x ?? 0,
      y: text.position?.y ?? 0,
      fontSize: text.font_size ?? 0.2,
      anchor: text.anchor ?? "center",
    }))

    // Convert schematic_port to ports
    const symbolPorts = ports.map((port, index) => ({
      x: port.center?.x ?? 0,
      y: port.center?.y ?? 0,
      labels: [port.display_pin_label || `${port.pin_number || index + 1}`],
      pinNumber: port.pin_number || index + 1,
      facingDirection: port.facing_direction,
    }))

    // Sort ports by pin_number
    symbolPorts.sort((a, b) => a.pinNumber - b.pinNumber)

    return {
      center: schematicSymbol.center || { x: 0, y: 0 },
      size: schematicSymbol.size || { width: 1, height: 1 },
      primitives,
      texts: symbolTexts,
      ports: symbolPorts,
    }
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
    referencePrefix,
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
      referencePrefix,
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
    referencePrefix,
  }: {
    symbol: SchematicSymbol
    libId: string
    description: string
    keywords: string
    fpFilters: string
    footprintRef?: string
    referencePrefix?: string
  }): void {
    const refPrefix = referencePrefix || libId.split(":")[1]?.[0] || "U"

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
    // For custom symbols, use a grid-aligned scale (15.24 = 12 * 1.27) so coordinates
    // naturally land on KiCad's 1.27mm grid. For chips, use the standard scale.
    const GRID_ALIGNED_SCALE = 15.24 // 12 * 1.27 - produces grid-aligned values for 0.5 increments
    const standardScale = this.ctx.c2kMatSch?.a || 15
    const symbolScale = isChip ? standardScale : GRID_ALIGNED_SCALE

    for (const primitive of symbolData.primitives || []) {
      if (primitive.type === "path" && primitive.points) {
        // Use background fill for chip boxes OR when primitive has fill=true
        const fillType = isChip || primitive.fill ? "background" : "none"
        const polyline = this.createPolylineFromPoints({
          points: primitive.points,
          scale: symbolScale,
          center: symbolData.center,
          fillType: fillType,
        })
        drawingSymbol.polylines.push(polyline)
      } else if (primitive.type === "circle") {
        const circle = this.createCircleFromPrimitive({
          primitive,
          scale: symbolScale,
          center: symbolData.center,
        })
        drawingSymbol.circles.push(circle)
      }
      // Note: schematic-symbols typically uses paths, not box primitives
    }

    // Convert text primitives to KiCad SymbolText elements
    for (const textData of symbolData.texts || []) {
      const symbolText = this.createTextFromPrimitive({
        textData,
        scale: symbolScale,
        center: symbolData.center,
      })
      drawingSymbol.texts.push(symbolText)
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
   * Create a KiCad circle from a schematic-symbols circle primitive
   */
  private createCircleFromPrimitive({
    primitive,
    scale,
    center,
  }: {
    primitive: any
    scale: number
    center: { x: number; y: number } | undefined
  }): SymbolCircle {
    const circle = new SymbolCircle()

    // Scale the circle position
    const cx = center?.x ?? 0
    const cy = center?.y ?? 0
    const scaleMatrix = createScaleMatrix(scale, scale)
    const scaledPos = applyToPoint(scaleMatrix, {
      x: primitive.x - cx,
      y: primitive.y - cy,
    })

    const c = circle as any
    c._sxCenter = new SymbolCircleCenter(scaledPos.x, scaledPos.y)
    c._sxRadius = new SymbolCircleRadius(primitive.radius * scale)

    const stroke = new Stroke()
    stroke.width = 0.254
    stroke.type = "default"
    c._sxStroke = stroke

    const fill = new SymbolCircleFill()
    fill.type = primitive.fill ? "background" : "none"
    c._sxFill = fill

    return circle
  }

  /**
   * Create a KiCad SymbolText from a schematic_text primitive
   */
  private createTextFromPrimitive({
    textData,
    scale,
    center,
  }: {
    textData: {
      text: string
      x: number
      y: number
      fontSize: number
      anchor?: string
    }
    scale: number
    center: { x: number; y: number } | undefined
  }): SymbolText {
    const symbolText = new SymbolText()

    // Scale the text position
    const cx = center?.x ?? 0
    const cy = center?.y ?? 0
    const scaleMatrix = createScaleMatrix(scale, scale)
    const scaledPos = applyToPoint(scaleMatrix, {
      x: textData.x - cx,
      y: textData.y - cy,
    })

    symbolText.value = textData.text
    symbolText.at = [scaledPos.x, scaledPos.y, 0]

    // Scale font size with a reduced factor for better visual appearance
    // Circuit-json font sizes are in schematic units (typically 0.1-0.5)
    // KiCad expects mm, with typical symbol text around 1.0-1.5mm
    // Use a scaling factor of ~5 instead of the full position scale
    const TEXT_SCALE_FACTOR = 5
    const scaledFontSize = textData.fontSize * TEXT_SCALE_FACTOR
    const font = new TextEffectsFont()
    font.size = { height: scaledFontSize, width: scaledFontSize }
    symbolText.effects = new TextEffects({ font })

    return symbolText
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

      // Pin lengths in mm - chips need longer pins to extend beyond the box,
      // custom symbols use standard KiCad grid unit
      const CHIP_PIN_LENGTH = 6.0 // Long pins for chip boxes
      const CUSTOM_SYMBOL_PIN_LENGTH = 2.54 // Standard KiCad grid unit (0.1 inch)
      pin.length = isChip ? CHIP_PIN_LENGTH : CUSTOM_SYMBOL_PIN_LENGTH

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
   * Scale pins to match the symbol scale
   */
  private calculatePinPosition(
    port: any,
    center: any,
    size?: any,
    isChip?: boolean,
    portIndex?: number,
    schematicComponent?: SchematicComponent,
  ): { x: number; y: number; angle: number } {
    // For custom symbols, use grid-aligned scale so coordinates land on KiCad's 1.27mm grid
    const GRID_ALIGNED_SCALE = 15.24 // 12 * 1.27
    const standardScale = this.ctx.c2kMatSch?.a || 15
    const symbolScale = isChip ? standardScale : GRID_ALIGNED_SCALE

    // Get the actual port position from circuit JSON if available
    let portX = port.x ?? 0
    let portY = port.y ?? 0
    let usingCircuitJsonPort = false

    // Only override port positions for chips - custom symbols already have correct positions
    // from buildSymbolDataFromSchematicPrimitives
    if (isChip && portIndex !== undefined && schematicComponent) {
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
    // Pin length for chips - must match CHIP_PIN_LENGTH in createPinSubsymbol
    const CHIP_PIN_LENGTH = 6.0

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

    // KiCad Pin Angle Reference:
    // The angle determines where the pin LINE extends FROM the connection point (where wires attach).
    // The pin line extends in the OPPOSITE direction of the angle.
    //
    // Angle 0°:   Pin line extends LEFT      ←──o  (wire connects at 'o')
    // Angle 180°: Pin line extends RIGHT     o──→  (wire connects at 'o')
    // Angle 90°:  Pin line extends DOWN      o     (wire connects at 'o')
    //                                        ↓
    // Angle 270°: Pin line extends UP        ↑     (wire connects at 'o')
    //                                        o
    //
    // For symbols, pins should point TOWARD the symbol body so wires connect on the outside.
    //
    // Examples:
    //   - Pin on RIGHT side of symbol: angle=180 (line extends right, away from symbol)
    //   - Pin on LEFT side of symbol:  angle=0   (line extends left, away from symbol)
    //   - Pin on TOP of symbol:        angle=270 (line extends up, away from symbol)
    //   - Pin on BOTTOM of symbol:     angle=90  (line extends down, away from symbol)

    let angle = 0
    if (isHorizontalPin) {
      if (dx > 0) {
        // Pin on RIGHT side of symbol
        angle = 180 // Line extends right, wire connects on right edge
        if (isChip) {
          x = x + CHIP_PIN_LENGTH // Move connection point outward from box
        }
      } else {
        // Pin on LEFT side of symbol
        angle = 0 // Line extends left, wire connects on left edge
        if (isChip) {
          x = x - CHIP_PIN_LENGTH // Move connection point outward from box
        }
      }
    } else {
      if (dy > 0) {
        // Pin on TOP of symbol
        angle = 270 // Line extends up, wire connects on top edge
        if (isChip) {
          y = y + CHIP_PIN_LENGTH // Move connection point outward from box
        }
      } else {
        // Pin on BOTTOM of symbol
        angle = 90 // Line extends down, wire connects on bottom edge
        if (isChip) {
          y = y - CHIP_PIN_LENGTH // Move connection point outward from box
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
