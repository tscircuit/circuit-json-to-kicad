import type { CircuitJson } from "circuit-json"
import type { KicadSch } from "kicadts"
import {
  LibSymbols,
  SchematicSymbol,
  SymbolProperty,
  SymbolPin,
  SymbolPinNumbers,
  SymbolPinNames,
  SymbolPinName,
  SymbolPinNumber,
  SymbolRectangle,
  SymbolRectangleStart,
  SymbolRectangleEnd,
  SymbolRectangleFill,
  SymbolFillType,
  Stroke,
  StrokeType,
  Width,
  TextEffects,
  TextEffectsFont,
  EmbeddedFonts,
} from "kicadts"
import { ConverterStage, type ConverterContext } from "../../types"
import type { SourceSimpleResistor } from "circuit-json"

/**
 * Adds library symbol definitions (Device:R, etc.) to the lib_symbols section
 */
export class AddLibrarySymbolsStage extends ConverterStage<
  CircuitJson,
  KicadSch
> {
  override _step(): void {
    const { kicadSch, db } = this.ctx

    // Get all source components
    const resistors = db.source_component
      .list()
      .filter(
        (sc): sc is SourceSimpleResistor => sc.ftype === "simple_resistor",
      )

    if (resistors.length === 0) {
      this.finished = true
      return
    }

    // Create lib_symbols section
    const libSymbols = new LibSymbols()
    const symbols: SchematicSymbol[] = []

    // For now, we'll just create a Device:R symbol definition
    // This is the library template that will be instantiated later
    const resistorLibSymbol = this.createResistorLibrarySymbol()
    symbols.push(resistorLibSymbol)

    libSymbols.symbols = symbols
    kicadSch.libSymbols = libSymbols

    this.finished = true
  }

  /**
   * Creates the Device:R library symbol definition with drawing primitives and pins
   */
  private createResistorLibrarySymbol(): SchematicSymbol {
    const symbol = new SchematicSymbol({
      libraryId: "Device:R",
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

    // Add properties (Reference, Value, Footprint, Datasheet, Description, etc.)
    const referenceProperty = new SymbolProperty({
      key: "Reference",
      value: "R",
      id: 0,
      at: [2.032, 0, 90],
      effects: this.createTextEffects(1.27),
    })

    const valueProperty = new SymbolProperty({
      key: "Value",
      value: "R",
      id: 1,
      at: [0, 0, 90],
      effects: this.createTextEffects(1.27),
    })

    const footprintProperty = new SymbolProperty({
      key: "Footprint",
      value: "",
      id: 2,
      at: [-1.778, 0, 90],
      effects: this.createTextEffects(1.27, true),
    })

    const datasheetProperty = new SymbolProperty({
      key: "Datasheet",
      value: "~",
      id: 3,
      at: [0, 0, 0],
      effects: this.createTextEffects(1.27, true),
    })

    const descriptionProperty = new SymbolProperty({
      key: "Description",
      value: "Resistor",
      id: 4,
      at: [0, 0, 0],
      effects: this.createTextEffects(1.27, true),
    })

    const keywordsProperty = new SymbolProperty({
      key: "ki_keywords",
      value: "R res resistor",
      id: 5,
      at: [0, 0, 0],
      effects: this.createTextEffects(1.27, true),
    })

    const fpFiltersProperty = new SymbolProperty({
      key: "ki_fp_filters",
      value: "R_*",
      id: 6,
      at: [0, 0, 0],
      effects: this.createTextEffects(1.27, true),
    })

    symbol.properties.push(
      referenceProperty,
      valueProperty,
      footprintProperty,
      datasheetProperty,
      descriptionProperty,
      keywordsProperty,
      fpFiltersProperty,
    )

    // Create the R_0_1 subsymbol (drawing elements)
    const drawingSymbol = new SchematicSymbol({
      libraryId: "R_0_1",
    })

    // Add resistor rectangle drawing
    const rectangle = new SymbolRectangle()
    const start = new SymbolRectangleStart(-1.016, -2.54)
    const end = new SymbolRectangleEnd(1.016, 2.54)
    const stroke = new Stroke()
    const width = new Width()
    width.value = 0.254
    stroke._sxWidth = width
    const strokeType = new StrokeType()
    strokeType.type = "default"
    stroke._sxType = strokeType
    const fill = new SymbolRectangleFill()
    const fillType = new SymbolFillType("none")
    fill._sxType = fillType

    rectangle._sxStart = start
    rectangle._sxEnd = end
    rectangle._sxStroke = stroke
    rectangle._sxFill = fill

    drawingSymbol.rectangles.push(rectangle)
    symbol.subSymbols.push(drawingSymbol)

    // Create the R_1_1 subsymbol (pin definitions)
    const pinSymbol = new SchematicSymbol({
      libraryId: "R_1_1",
    })

    // Pin 1 (top)
    const pin1 = new SymbolPin()
    pin1.pinElectricalType = "passive"
    pin1.pinGraphicStyle = "line"
    pin1.at = [0, 3.81, 270]
    pin1.length = 1.27

    // Create the name with effects
    const nameFont1 = new TextEffectsFont()
    nameFont1.size = { height: 1.27, width: 1.27 }
    const nameEffects1 = new TextEffects({ font: nameFont1 })
    pin1._sxName = new SymbolPinName({ value: "~", effects: nameEffects1 })

    // Create the number with effects
    const numFont1 = new TextEffectsFont()
    numFont1.size = { height: 1.27, width: 1.27 }
    const numEffects1 = new TextEffects({ font: numFont1 })
    pin1._sxNumber = new SymbolPinNumber({ value: "1", effects: numEffects1 })

    // Pin 2 (bottom)
    const pin2 = new SymbolPin()
    pin2.pinElectricalType = "passive"
    pin2.pinGraphicStyle = "line"
    pin2.at = [0, -3.81, 90]
    pin2.length = 1.27

    // Create the name with effects
    const nameFont2 = new TextEffectsFont()
    nameFont2.size = { height: 1.27, width: 1.27 }
    const nameEffects2 = new TextEffects({ font: nameFont2 })
    pin2._sxName = new SymbolPinName({ value: "~", effects: nameEffects2 })

    // Create the number with effects
    const numFont2 = new TextEffectsFont()
    numFont2.size = { height: 1.27, width: 1.27 }
    const numEffects2 = new TextEffects({ font: numFont2 })
    pin2._sxNumber = new SymbolPinNumber({ value: "2", effects: numEffects2 })

    pinSymbol.pins.push(pin1, pin2)
    symbol.subSymbols.push(pinSymbol)

    // Set embedded_fonts
    symbol._sxEmbeddedFonts = new EmbeddedFonts(false)

    return symbol
  }

  /**
   * Creates text effects for properties
   */
  private createTextEffects(size: number, hide: boolean = false): TextEffects {
    const font = new TextEffectsFont()
    font.size = { height: size, width: size }

    const effects = new TextEffects({
      font: font,
      hiddenText: hide,
    })

    return effects
  }

  getOutput(): KicadSch {
    return this.ctx.kicadSch
  }
}
