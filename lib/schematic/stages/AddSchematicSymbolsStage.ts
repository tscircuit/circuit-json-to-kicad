import type { KicadSymbolMetadata } from "@tscircuit/props"
import type {
  CircuitJson,
  SchematicComponent,
  SchematicText,
} from "circuit-json"
import { formatSiUnit } from "format-si-unit"
import type { KicadSch } from "kicadts"
import {
  EmbeddedFonts,
  SchematicSymbol,
  SymbolInstancePath,
  SymbolInstances,
  SymbolInstancesProject,
  SymbolLibId,
  SymbolPin,
  SymbolPinNames,
  SymbolPinNumbers,
  SymbolProperty,
  TextEffects,
  TextEffectsFont,
  TextEffectsJustify,
  Uuid,
} from "kicadts"
import { applyToPoint } from "transformation-matrix"
import { type ConverterContext, ConverterStage } from "../../types"
import {
  getKicadCompatibleCustomSymbolName,
  getReferenceDesignator,
} from "../../utils/getKicadCompatibleComponentName"
import { getLibraryId } from "../getLibraryId"
import { getSchematicSymbolData } from "../getSchematicSymbolData"
import {
  getTextJustificationFromAnchor,
  type TextJustification,
} from "./utils/getTextJustificationFromAnchor"

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
        // Circuit JSON already supplies the intended field positions. Marking
        // these fields as autoplaced lets KiCad rearrange them on load and
        // breaks their alignment with pins and net labels.
        fieldsAutoplaced: false,
      })

      // Get the cad_component for footprinter_string (if available)
      const cadComponent = db.cad_component
        ?.list()
        ?.find(
          (cad: any) =>
            cad.source_component_id === sourceComponent.source_component_id,
        )

      // Check for custom symbol via schematic_symbol_id
      let schematicSymbolName: string | undefined
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
        const schematicSymbol = this.ctx.circuitJson.find(
          (el: any) =>
            el.type === "schematic_symbol" &&
            el.schematic_symbol_id === schematicSymbolId,
        ) as any
        if (schematicSymbol?.name) {
          schematicSymbolName = schematicSymbol.name
        } else {
          schematicSymbolName = getKicadCompatibleCustomSymbolName(
            sourceComponent,
            cadComponent,
            schematicSymbolId,
          )
        }
      }

      // Get the appropriate library ID based on component type
      const libId = getLibraryId(
        sourceComponent,
        schematicComponent,
        cadComponent,
        schematicSymbolName,
      )
      const symLibId = new SymbolLibId(libId)
      ;(symbol as any)._sxLibId = symLibId

      // Get component metadata
      const { reference, value, description } =
        this.getComponentMetadata(sourceComponent)
      const hasManufacturerValueForValuePlacement =
        (sourceComponent.ftype === "simple_chip" ||
          sourceComponent.ftype === "simple_connector") &&
        Boolean(sourceComponent.manufacturer_part_number)

      // Get text positions from schematic symbol definition
      const { refTextPos, valTextPos, refJustify, valJustify } =
        this.getTextPositions({
          schematicComponent,
          placeValueAtNamePosition: hasManufacturerValueForValuePlacement,
          reference,
          value,
        })

      // Check for kicadSymbolMetadata from circuit-json element
      let symbolMetadata: KicadSymbolMetadata | undefined
      if (schematicSymbolId) {
        const schSymEl = this.ctx.circuitJson.find(
          (el) =>
            el.type === "schematic_symbol" &&
            el.schematic_symbol_id === schematicSymbolId,
        )
        if (schSymEl && schSymEl.type === "schematic_symbol") {
          symbolMetadata = schSymEl.metadata?.kicad_symbol
        }
      }

      // Add properties for this instance, applying metadata if available
      const refMeta = symbolMetadata?.properties?.Reference
      const hideGeneratedCustomReference = Boolean(schematicSymbolId)
      const referenceProperty = new SymbolProperty({
        key: "Reference",
        value: refMeta?.value ?? reference,
        id: 0,
        at: [refTextPos.x, refTextPos.y, 0],
        effects: this.createTextEffects(
          Number(refMeta?.effects?.font?.size?.x ?? 1.27),
          {
            hide: refMeta?.effects?.hide ?? hideGeneratedCustomReference,
            justify: refJustify,
          },
        ),
      })

      const hideValue =
        Boolean(schematicSymbolId) ||
        (sourceComponent.ftype === "simple_chip" &&
          !hasManufacturerValueForValuePlacement) ||
        (sourceComponent.ftype === "simple_diode" &&
          !schematicComponent.symbol_display_value) ||
        sourceComponent.ftype === "simple_pin_header" ||
        sourceComponent.ftype === "simple_test_point"
      const valMeta = symbolMetadata?.properties?.Value
      const valueProperty = new SymbolProperty({
        key: "Value",
        value: valMeta?.value ?? value,
        id: 1,
        at: [valTextPos.x, valTextPos.y, 0],
        effects: this.createTextEffects(
          Number(valMeta?.effects?.font?.size?.x ?? 1.27),
          { hide: valMeta?.effects?.hide ?? hideValue, justify: valJustify },
        ),
      })

      const fpMeta = symbolMetadata?.properties?.Footprint
      const footprintProperty = new SymbolProperty({
        key: "Footprint",
        value: fpMeta?.value ?? "",
        id: 2,
        at: [x - 1.778, y, 90],
        effects: this.createTextEffects(1.27, {
          hide: fpMeta?.effects?.hide ?? true,
        }),
      })

      const dsMeta = symbolMetadata?.properties?.Datasheet
      const datasheetProperty = new SymbolProperty({
        key: "Datasheet",
        value: dsMeta?.value ?? "~",
        id: 3,
        at: [x, y, 0],
        effects: this.createTextEffects(1.27, {
          hide: dsMeta?.effects?.hide ?? true,
        }),
      })

      const descMeta = symbolMetadata?.properties?.Description
      const descriptionProperty = new SymbolProperty({
        key: "Description",
        value: descMeta?.value ?? description,
        id: 4,
        at: [x, y, 0],
        effects: this.createTextEffects(1.27, {
          hide: descMeta?.effects?.hide ?? true,
        }),
      })

      symbol.properties.push(
        referenceProperty,
        valueProperty,
        footprintProperty,
        datasheetProperty,
        descriptionProperty,
      )

      // Add ki_keywords property if provided in metadata
      const kwMeta = symbolMetadata?.properties?.ki_keywords
      if (kwMeta?.value) {
        const keywordsProperty = new SymbolProperty({
          key: "ki_keywords",
          value: kwMeta.value,
          id: 5,
          at: [x, y, 0],
          effects: this.createTextEffects(1.27, {
            hide: kwMeta.effects?.hide ?? true,
          }),
        })
        symbol.properties.push(keywordsProperty)
      }

      // Add ki_fp_filters property if provided in metadata
      const fpFilterMeta = symbolMetadata?.properties?.ki_fp_filters
      if (fpFilterMeta?.value) {
        const fpFiltersProperty = new SymbolProperty({
          key: "ki_fp_filters",
          value: fpFilterMeta.value,
          id: 6,
          at: [x, y, 0],
          effects: this.createTextEffects(1.27, {
            hide: fpFilterMeta.effects?.hide ?? true,
          }),
        })
        symbol.properties.push(fpFiltersProperty)
      }

      // Apply additional symbol metadata fields
      if (symbolMetadata) {
        // Apply inBom if provided
        if (symbolMetadata.inBom !== undefined) {
          symbol.inBom = symbolMetadata.inBom
        }

        // Apply onBoard if provided
        if (symbolMetadata.onBoard !== undefined) {
          symbol.onBoard = symbolMetadata.onBoard
        }

        // Apply excludeFromSim if provided
        if (symbolMetadata.excludeFromSim !== undefined) {
          symbol.excludeFromSim = symbolMetadata.excludeFromSim
        }

        // Apply pinNames if provided
        if (symbolMetadata.pinNames) {
          const pinNames = new SymbolPinNames()
          if (symbolMetadata.pinNames.offset !== undefined) {
            pinNames.offset = Number(symbolMetadata.pinNames.offset)
          }
          if (symbolMetadata.pinNames.hide !== undefined) {
            pinNames.hide = symbolMetadata.pinNames.hide
          }
          symbol.pinNames = pinNames
        }

        // Apply pinNumbers if provided
        if (symbolMetadata.pinNumbers) {
          const pinNumbers = new SymbolPinNumbers()
          if (symbolMetadata.pinNumbers.hide !== undefined) {
            pinNumbers.hide = symbolMetadata.pinNumbers.hide
          }
          symbol.pinNumbers = pinNumbers
        }

        // Apply embeddedFonts if provided
        if (symbolMetadata.embeddedFonts !== undefined) {
          symbol._sxEmbeddedFonts = new EmbeddedFonts(
            symbolMetadata.embeddedFonts,
          )
        }
      }

      // Add pin instances with UUIDs based on schematic ports
      // For custom symbols, use only ports with display_pin_label
      // For regular components, use all ports
      let schematicPorts = db.schematic_port
        .list()
        .filter(
          (p: any) =>
            p.schematic_component_id ===
            schematicComponent.schematic_component_id,
        )

      // If this is a custom symbol, filter to only ports with display_pin_label
      if (schematicSymbolId) {
        const customSymbolPorts = schematicPorts.filter(
          (p: any) => p.display_pin_label,
        )
        // Only use filtered ports if we found some
        if (customSymbolPorts.length > 0) {
          schematicPorts = customSymbolPorts
        }
      }

      // Sort by pin number or use index
      schematicPorts.sort(
        (a: any, b: any) => (a.pin_number || 0) - (b.pin_number || 0),
      )

      for (let i = 0; i < schematicPorts.length; i++) {
        const port = schematicPorts[i]
        if (!port) continue
        const pin = new SymbolPin()
        // Use pin_number if available, otherwise use 1-based index
        pin.numberString = `${port.pin_number || i + 1}`
        pin.uuid = crypto.randomUUID()
        symbol.pins.push(pin)
      }

      // Add instances section
      const instances = new SymbolInstances()
      const project = new SymbolInstancesProject("")
      const instancePathPrefix =
        this.ctx.symbolInstancePathPrefix ?? `/${kicadSch?.uuid?.value || ""}`
      const path = new SymbolInstancePath(instancePathPrefix)
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
  private getTextPositions({
    schematicComponent,
    placeValueAtNamePosition,
    reference,
    value,
  }: {
    schematicComponent: SchematicComponent
    placeValueAtNamePosition: boolean
    reference: string
    value: string
  }): {
    refTextPos: { x: number; y: number }
    valTextPos: { x: number; y: number }
    refJustify?: TextJustification
    valJustify?: TextJustification
  } {
    const c2kMatSch = this.ctx.c2kMatSch!
    const symbolKicadPos = applyToPoint(c2kMatSch, {
      x: schematicComponent.center.x,
      y: schematicComponent.center.y,
    })
    const bodyEdge = applyToPoint(c2kMatSch, {
      x: schematicComponent.center.x,
      y:
        schematicComponent.center.y +
        (schematicComponent.size?.height || 1) / 2,
    })
    const componentHeightMm = Math.abs(bodyEdge.y - symbolKicadPos.y) * 2
    const referenceAboveBodyY = symbolKicadPos.y - componentHeightMm / 2 - 3
    const valueBelowBodyY = symbolKicadPos.y + componentHeightMm / 2 + 3

    const isCustomSymbol = this.isCustomSymbolComponent(schematicComponent)
    if (isCustomSymbol) {
      const customHeightMm =
        (schematicComponent.size?.height || 1) *
        this.ctx.kicadSchematicScaleFactor!
      const refTextPos = {
        x: symbolKicadPos.x,
        y: symbolKicadPos.y - customHeightMm / 2 - 3,
      }
      const valTextPos = {
        x: symbolKicadPos.x,
        y: symbolKicadPos.y + customHeightMm / 2 + 3,
      }
      if (placeValueAtNamePosition) {
        return {
          refTextPos,
          valTextPos: { x: symbolKicadPos.x, y: symbolKicadPos.y },
        }
      }
      return { refTextPos, valTextPos }
    }

    // First check if there are schematic_text elements for this component
    const schematicTexts =
      this.ctx.db.schematic_text
        ?.list?.()
        ?.filter(
          (t) =>
            t.schematic_component_id ===
            schematicComponent.schematic_component_id,
        ) || []

    // Circuit JSON emits independent text primitives for component fields. Use
    // the matching field text rather than choosing the first primitive or
    // centering the field around the symbol: their positions encode the
    // schematic author's intended alignment.
    const referenceText = schematicTexts.find(
      (text) => reference.length > 0 && text.text === reference,
    )
    const valueText = schematicTexts.find(
      (text) => value.length > 0 && value !== reference && text.text === value,
    )
    const refTextPosFromCircuitJson = this.getTextPosition(referenceText)
    const valTextPosFromCircuitJson = this.getTextPosition(valueText)

    if (refTextPosFromCircuitJson || valTextPosFromCircuitJson) {
      return {
        refTextPos: refTextPosFromCircuitJson?.position ?? {
          x: symbolKicadPos.x,
          y: referenceAboveBodyY,
        },
        valTextPos: valTextPosFromCircuitJson?.position ?? {
          x: symbolKicadPos.x,
          y: valueBelowBodyY,
        },
        refJustify: refTextPosFromCircuitJson?.justify,
        valJustify: valTextPosFromCircuitJson?.justify,
      }
    }

    const refText = schematicTexts.find((t) => t.text && t.text.length > 0)

    if (refText) {
      // Use the schematic_text position for reference
      const nameTextPos = this.getTextPosition(refText)!.position

      if (placeValueAtNamePosition) {
        return {
          refTextPos: { x: symbolKicadPos.x, y: referenceAboveBodyY },
          valTextPos: nameTextPos,
        }
      }

      const refTextPos = nameTextPos
      const valTextPos = { x: symbolKicadPos.x, y: valueBelowBodyY }
      return { refTextPos, valTextPos }
    }

    const symbolName = schematicComponent.symbol_name
    if (!symbolName) {
      return {
        refTextPos: { x: symbolKicadPos.x, y: referenceAboveBodyY },
        valTextPos: { x: symbolKicadPos.x, y: valueBelowBodyY },
      }
    }
    const symbol = getSchematicSymbolData(symbolName)

    // Default positions if symbol not found
    if (!symbol) {
      return {
        refTextPos: { x: symbolKicadPos.x, y: referenceAboveBodyY },
        valTextPos: { x: symbolKicadPos.x, y: valueBelowBodyY },
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
    // Need to subtract symbol center to match the normalized geometry
    const symbolCenter = symbol.center || { x: 0, y: 0 }

    const refTextPos = refTextPrimitive
      ? applyToPoint(c2kMatSch, {
          x:
            schematicComponent.center.x + (refTextPrimitive.x - symbolCenter.x),
          y:
            schematicComponent.center.y + (refTextPrimitive.y - symbolCenter.y),
        })
      : { x: symbolKicadPos.x, y: referenceAboveBodyY }

    const valTextPos = valTextPrimitive
      ? applyToPoint(c2kMatSch, {
          x:
            schematicComponent.center.x + (valTextPrimitive.x - symbolCenter.x),
          y:
            schematicComponent.center.y + (valTextPrimitive.y - symbolCenter.y),
        })
      : { x: symbolKicadPos.x, y: valueBelowBodyY }

    // Text positions are anchor points, not centers. Preserve the primitive's
    // alignment so longer fields grow away from the symbol instead of across it.
    return {
      refTextPos,
      valTextPos,
      refJustify: getTextJustificationFromAnchor(refTextPrimitive?.anchor),
      valJustify: getTextJustificationFromAnchor(valTextPrimitive?.anchor),
    }
  }

  private getTextPosition(text?: SchematicText) {
    if (!text) return undefined
    return {
      position: applyToPoint(this.ctx.c2kMatSch!, text.position),
      justify: getTextJustificationFromAnchor(text.anchor),
    }
  }

  private isCustomSymbolComponent(
    schematicComponent: SchematicComponent,
  ): boolean {
    const componentId = schematicComponent.schematic_component_id
    if (!componentId) return false
    return this.ctx.circuitJson.some(
      (el: any) =>
        (el.type === "schematic_line" ||
          el.type === "schematic_circle" ||
          el.type === "schematic_path") &&
        el.schematic_component_id === componentId &&
        el.schematic_symbol_id,
    )
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
    const reference = getReferenceDesignator(sourceComp)

    if (sourceComp.ftype === "simple_resistor") {
      return {
        reference,
        value: sourceComp.display_resistance || "R",
        description: "Resistor",
      }
    }

    if (sourceComp.ftype === "simple_capacitor") {
      return {
        reference,
        value: sourceComp.display_capacitance || "C",
        description: "Capacitor",
      }
    }

    if (sourceComp.ftype === "simple_inductor") {
      return {
        reference,
        value: sourceComp.display_inductance || "L",
        description: "Inductor",
      }
    }

    if (sourceComp.ftype === "simple_crystal") {
      const frequencyDisplay = `${formatSiUnit(sourceComp.frequency)}Hz`
      const loadCapacitanceDisplay = sourceComp.load_capacitance
        ? ` / ${formatSiUnit(sourceComp.load_capacitance)}F`
        : ""

      return {
        reference,
        value: `${frequencyDisplay}${loadCapacitanceDisplay}`,
        description: "Crystal oscillator",
      }
    }

    if (sourceComp.ftype === "simple_diode") {
      return {
        reference,
        value: sourceComp.manufacturer_part_number || "",
        description: "Diode",
      }
    }

    if (sourceComp.ftype === "simple_chip") {
      return {
        reference,
        value: sourceComp.manufacturer_part_number || "",
        description: "Integrated Circuit",
      }
    }
    if (sourceComp.ftype === "simple_led") {
      return {
        reference,
        value: sourceComp.manufacturer_part_number || "",
        description: "LED",
      }
    }
    if (sourceComp.ftype === "simple_switch") {
      return {
        reference,
        value: sourceComp.manufacturer_part_number || "",
        description: "Switch",
      }
    }
    if (sourceComp.ftype === "simple_potentiometer") {
      return {
        reference,
        value: sourceComp.display_max_resistance || "",
        description: "Potentiometer",
      }
    }
    if (sourceComp.ftype === "simple_connector") {
      return {
        reference,
        value: sourceComp.manufacturer_part_number || "",
        description: "Connector",
      }
    }

    // Default
    return {
      reference,
      value: name,
      description: "Component",
    }
  }

  /**
   * Creates text effects for properties
   */
  private createTextEffects(
    size: number,
    {
      hide = false,
      justify,
    }: { hide?: boolean; justify?: TextJustification } = {},
  ): TextEffects {
    const font = new TextEffectsFont()
    font.size = { height: size, width: size }

    const justifyObj = justify ? new TextEffectsJustify(justify) : undefined

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
