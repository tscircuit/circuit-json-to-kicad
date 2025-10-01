import type { CircuitJson } from "circuit-json"
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
  override _step(): void {
    const { kicadSch, db } = this.ctx

    // Get all schematic components
    const schematicComponents = db.schematic_component.list()

    if (schematicComponents.length === 0) {
      this.finished = true
      return
    }

    const symbols: SchematicSymbol[] = []

    // Place each component on the schematic
    for (const schematicComponent of schematicComponents) {
      const sourceComponent = schematicComponent.source_component_id
        ? db.source_component.get(schematicComponent.source_component_id)
        : null

      if (!sourceComponent) continue

      // Convert circuit-json coordinates (mm) to KiCad coordinates (mm)
      // KiCad default position is around 95.25, 73.66 for a centered component
      const x = 95.25 + schematicComponent.center.x * 25.4 // Convert to mm and offset
      const y = 73.66 + schematicComponent.center.y * 25.4 // Convert to mm and offset

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

      // Get the appropriate library ID based on component type
      const libId = this.getLibraryId(sourceComponent)
      symbol._sxLibId = new SymbolLibId(libId)

      // Get component metadata
      const { reference, value, description } =
        this.getComponentMetadata(sourceComponent)

      // Add properties for this instance
      // Position text labels above and below the component symbol
      // The symbol body is approximately 5mm tall, centered on the component
      const referenceProperty = new SymbolProperty({
        key: "Reference",
        value: reference,
        id: 0,
        at: [x, y - 6, 0],
        effects: this.createTextEffects(1.27, false),
      })

      const valueProperty = new SymbolProperty({
        key: "Value",
        value: value,
        id: 1,
        at: [x, y + 6, 0],
        effects: this.createTextEffects(1.27, false),
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
        value: description,
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
      path.reference = reference
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
   * Get KiCad library ID for a component
   */
  private getLibraryId(sourceComp: any): string {
    // Map common component types to KiCad library IDs
    if (sourceComp.ftype === "simple_resistor") {
      return "Device:R"
    }
    if (sourceComp.ftype === "simple_capacitor") {
      return "Device:C"
    }
    if (sourceComp.ftype === "simple_inductor") {
      return "Device:L"
    }
    if (sourceComp.ftype === "simple_diode") {
      return "Device:D"
    }
    // Default: use a generic name
    return "Device:Component"
  }

  /**
   * Get component metadata (reference, value, description)
   */
  private getComponentMetadata(sourceComp: any): {
    reference: string
    value: string
    description: string
  } {
    const name = sourceComp.name || "?"

    if (sourceComp.ftype === "simple_resistor") {
      return {
        reference: name,
        value: sourceComp.display_resistance || "R",
        description: "Resistor",
      }
    }

    if (sourceComp.ftype === "simple_capacitor") {
      return {
        reference: name,
        value: sourceComp.display_capacitance || "C",
        description: "Capacitor",
      }
    }

    if (sourceComp.ftype === "simple_inductor") {
      return {
        reference: name,
        value: sourceComp.display_inductance || "L",
        description: "Inductor",
      }
    }

    if (sourceComp.ftype === "simple_diode") {
      return {
        reference: name,
        value: "D",
        description: "Diode",
      }
    }

    // Default
    return {
      reference: name,
      value: name,
      description: "Component",
    }
  }

  /**
   * Creates text effects for properties
   */
  private createTextEffects(
    size: number,
    hide = false,
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

  override getOutput(): KicadSch {
    return this.ctx.kicadSch
  }
}
