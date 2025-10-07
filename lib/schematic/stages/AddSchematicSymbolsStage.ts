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
import { applyToPoint } from "transformation-matrix"
import { ConverterStage, type ConverterContext } from "../../types"
import { symbols } from "schematic-symbols"
import { getLibraryId } from "../getLibraryId"

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

      // Transform circuit-json coordinates to KiCad coordinates using c2kMatSch
      if (!this.ctx.c2kMatSch) continue
      const { x, y } = applyToPoint(this.ctx.c2kMatSch, {
        x: schematicComponent.center.x,
        y: schematicComponent.center.y,
      })

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
      const libId = getLibraryId(sourceComponent, schematicComponent)
      const symLibId = new SymbolLibId(libId)
      ;(symbol as any)._sxLibId = symLibId

      // Get component metadata
      const { reference, value, description } =
        this.getComponentMetadata(sourceComponent)

      // Get text positions from schematic symbol definition
      const { refTextPos, valTextPos } = this.getTextPositions(
        schematicComponent,
        { x, y },
      )

      // Add properties for this instance
      const referenceProperty = new SymbolProperty({
        key: "Reference",
        value: reference,
        id: 0,
        at: [refTextPos.x, refTextPos.y, 0],
        effects: this.createTextEffects(1.27, false),
      })

      // Hide value for chips since reference is usually sufficient
      const hideValue = sourceComponent.ftype === "simple_chip"
      const valueProperty = new SymbolProperty({
        key: "Value",
        value: value,
        id: 1,
        at: [valTextPos.x, valTextPos.y, 0],
        effects: this.createTextEffects(1.27, hideValue),
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

      // Add pin instances with UUIDs based on schematic ports
      const schematicPorts = db.schematic_port
        .list()
        .filter(
          (p: any) =>
            p.schematic_component_id ===
            schematicComponent.schematic_component_id,
        )
        .sort((a: any, b: any) => (a.pin_number || 0) - (b.pin_number || 0))

      for (const port of schematicPorts) {
        const pin = new SymbolPin()
        pin.numberString = `${port.pin_number || 1}`
        pin.uuid = crypto.randomUUID()
        symbol.pins.push(pin)
      }

      // Add instances section
      const instances = new SymbolInstances()
      const project = new SymbolInstancesProject("")
      const path = new SymbolInstancePath(`/${kicadSch?.uuid?.value || ""}`)
      path.reference = reference
      path.unit = 1
      project.paths.push(path)
      instances.projects.push(project)
      symbol._sxInstances = instances

      symbols.push(symbol)
    }

    if (kicadSch) {
      kicadSch.symbols = symbols
    }

    this.finished = true
  }

  /**
   * Get text positions from schematic symbol definition or schematic_text elements
   */
  private getTextPositions(
    schematicComponent: any,
    symbolKicadPos: { x: number; y: number },
  ): {
    refTextPos: { x: number; y: number }
    valTextPos: { x: number; y: number }
  } {
    // First check if there are schematic_text elements for this component
    const schematicTexts =
      this.ctx.db.schematic_text
        ?.list?.()
        ?.filter(
          (t: any) =>
            t.schematic_component_id ===
            schematicComponent.schematic_component_id,
        ) || []

    // Look for reference text (usually the component name like "U1")
    const refText = schematicTexts.find((t: any) => t.text && t.text.length > 0)

    if (refText && this.ctx.c2kMatSch) {
      // Use the schematic_text position for reference
      const refTextPos = applyToPoint(this.ctx.c2kMatSch, {
        x: refText.position.x,
        y: refText.position.y,
      })

      // For value, place it below the component (we'll hide it anyway for chips)
      const valTextPos = { x: symbolKicadPos.x, y: symbolKicadPos.y + 6 }

      return { refTextPos, valTextPos }
    }

    const symbolName = schematicComponent.symbol_name
    const symbol = (symbols as any)[symbolName]

    // Default positions if symbol not found
    if (!symbol) {
      return {
        refTextPos: { x: symbolKicadPos.x, y: symbolKicadPos.y - 6 },
        valTextPos: { x: symbolKicadPos.x, y: symbolKicadPos.y + 6 },
      }
    }

    // Find text primitives for REF and VAL
    let refTextPrimitive = null
    let valTextPrimitive = null

    for (const primitive of symbol.primitives) {
      if (primitive.type === "text") {
        if (primitive.text === "{REF}") {
          refTextPrimitive = primitive
        } else if (primitive.text === "{VAL}") {
          valTextPrimitive = primitive
        }
      }
    }

    // Calculate text positions by transforming the symbol-relative positions
    const refTextPos =
      refTextPrimitive && this.ctx.c2kMatSch
        ? applyToPoint(this.ctx.c2kMatSch, {
            x: schematicComponent.center.x + refTextPrimitive.x,
            y: schematicComponent.center.y + refTextPrimitive.y,
          })
        : { x: symbolKicadPos.x, y: symbolKicadPos.y - 6 }

    const valTextPos =
      valTextPrimitive && this.ctx.c2kMatSch
        ? applyToPoint(this.ctx.c2kMatSch, {
            x: schematicComponent.center.x + valTextPrimitive.x,
            y: schematicComponent.center.y + valTextPrimitive.y,
          })
        : { x: symbolKicadPos.x, y: symbolKicadPos.y + 6 }

    return { refTextPos, valTextPos }
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

    if (sourceComp.ftype === "simple_chip") {
      return {
        reference: name,
        value: name,
        description: "Integrated Circuit",
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
    if (!this.ctx.kicadSch) {
      throw new Error("kicadSch is not initialized")
    }
    return this.ctx.kicadSch
  }
}
