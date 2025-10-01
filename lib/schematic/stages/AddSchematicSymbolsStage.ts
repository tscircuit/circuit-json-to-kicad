import type { CircuitJson, SourceSimpleResistor } from "circuit-json"
import type { KicadSch } from "kicadts"
import {
  SchematicSymbol,
  SymbolLibId,
  SymbolProperty,
  SymbolPin,
  SymbolInstances,
  SymbolInstancesProject,
  SymbolInstancePath,
  Uuid,
  TextEffects,
  TextEffectsFont,
  TextEffectsJustify,
  EmbeddedFonts,
} from "kicadts"
import { ConverterStage, type ConverterContext } from "../../types"

/**
 * Adds schematic symbol instances (placed components) to the schematic
 */
export class AddSchematicSymbolsStage extends ConverterStage<
  CircuitJson,
  KicadSch
> {
  _step(): void {
    const { kicadSch, db } = this.ctx

    // Get all source components
    const resistors = db
      .source_component
      .list()
      .filter(
        (sc): sc is SourceSimpleResistor => sc.ftype === "simple_resistor",
      )

    if (resistors.length === 0) {
      this.finished = true
      return
    }

    const symbols: SchematicSymbol[] = []

    // Place each resistor on the schematic
    for (const resistor of resistors) {
      const schematicComponent = db.schematic_component
        .list()
        .find((sc) => sc.source_component_id === resistor.source_component_id)

      if (!schematicComponent) continue

      // Convert circuit-json coordinates (mm) to KiCad coordinates (mm)
      // KiCad default position is around 95.25, 73.66 for a centered component
      const x = 95.25 + (schematicComponent.center.x * 25.4) // Convert to mm and offset
      const y = 73.66 + (schematicComponent.center.y * 25.4) // Convert to mm and offset

      const uuid = crypto.randomUUID()

      const symbol = new SchematicSymbol({
        at: [x, y, 0],
        unit: 1,
        excludeFromSim: false,
        inBom: true,
        onBoard: true,
        dnp: false,
        uuid: uuid,
        fieldsAutoplaced: true,
      })

      // Set lib_id for placed symbol instances (not inline name)
      symbol._sxLibId = new SymbolLibId("Device:R")

      // Add properties for this instance
      const referenceProperty = new SymbolProperty({
        key: "Reference",
        value: resistor.name || "R?",
        id: 0,
        at: [x + 2.54, y - 1.27, 0],
        effects: this.createTextEffects(1.27, false, "left"),
      })

      const valueProperty = new SymbolProperty({
        key: "Value",
        value: resistor.display_resistance || "R",
        id: 1,
        at: [x + 2.54, y + 1.27, 0],
        effects: this.createTextEffects(1.27, false, "left"),
      })

      const footprintProperty = new SymbolProperty({
        key: "Footprint",
        value: "",
        id: 2,
        at: [x - 1.778, y, 90],
        effects: this.createTextEffects(1.27, true),
      })

      const datasheetProperty = new SymbolProperty({
        key: "Datasheet",
        value: "~",
        id: 3,
        at: [x, y, 0],
        effects: this.createTextEffects(1.27, true),
      })

      const descriptionProperty = new SymbolProperty({
        key: "Description",
        value: "Resistor",
        id: 4,
        at: [x, y, 0],
        effects: this.createTextEffects(1.27, true),
      })

      symbol.properties.push(
        referenceProperty,
        valueProperty,
        footprintProperty,
        datasheetProperty,
        descriptionProperty,
      )

      // Add pin instances with UUIDs
      const pin1 = new SymbolPin()
      pin1.numberString = "1"
      pin1.uuid = crypto.randomUUID()

      const pin2 = new SymbolPin()
      pin2.numberString = "2"
      pin2.uuid = crypto.randomUUID()

      symbol.pins.push(pin1, pin2)

      // Add instances section
      const instances = new SymbolInstances()
      const project = new SymbolInstancesProject("")
      const path = new SymbolInstancePath(`/${kicadSch.uuid?.value || ""}`)
      path.reference = resistor.name || "R?"
      path.unit = 1
      project.paths.push(path)
      instances.projects.push(project)
      symbol._sxInstances = instances

      symbols.push(symbol)
    }

    kicadSch.symbols = symbols

    this.finished = true
  }

  /**
   * Creates text effects for properties
   */
  private createTextEffects(
    size: number,
    hide: boolean = false,
    justify?: "left" | "right",
  ): TextEffects {
    const font = new TextEffectsFont()
    font.size = { height: size, width: size }

    const justifyObj = justify
      ? new TextEffectsJustify({ horizontal: justify })
      : undefined

    const effects = new TextEffects({
      font: font,
      hiddenText: hide,
      justify: justifyObj,
    })

    return effects
  }

  getOutput(): KicadSch {
    return this.ctx.kicadSch
  }
}
