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
  TextEffects,
  TextEffectsFont,
  TextEffectsJustify,
  GlobalLabel,
} from "kicadts"
import { applyToPoint } from "transformation-matrix"
import { ConverterStage } from "../../types"

/**
 * Adds schematic net labels to the schematic
 *
 * Net labels with symbol_name are treated as power/ground symbols (e.g., VCC, GND from schematic-symbols)
 * Net labels without symbol_name are converted to KiCad global labels
 * All use anchor_position as the primary coordinate source for positioning
 */
export class AddSchematicNetLabelsStage extends ConverterStage<
  CircuitJson,
  KicadSch
> {
  override _step(): void {
    const { kicadSch, db } = this.ctx

    // Get all schematic net labels
    const netLabels = db.schematic_net_label?.list?.() || []

    if (netLabels.length === 0) {
      this.finished = true
      return
    }

    if (!this.ctx.c2kMatSch) {
      this.finished = true
      return
    }

    const symbols: SchematicSymbol[] = []
    const globalLabels: GlobalLabel[] = []

    for (const netLabel of netLabels) {
      const labelText = netLabel.text || ""
      const symbolName = netLabel.symbol_name

      if (symbolName) {
        // Create a power/ground symbol using the schematic-symbols symbol
        const symbol = this.createSymbolFromNetLabel(
          netLabel,
          labelText,
          symbolName,
        )
        if (symbol) {
          symbols.push(symbol)
        }
      } else {
        // Create a regular global label
        const label = this.createGlobalLabel(netLabel, labelText)
        if (label) {
          globalLabels.push(label)
        }
      }
    }

    // Add symbols to the existing symbols array
    if (kicadSch && symbols.length > 0) {
      const existingSymbols = kicadSch.symbols || []
      kicadSch.symbols = [...existingSymbols, ...symbols]
    }

    // Add labels to the schematic
    if (kicadSch && globalLabels.length > 0) {
      kicadSch.globalLabels = [
        ...(kicadSch.globalLabels || []),
        ...globalLabels,
      ]
    }

    this.finished = true
  }

  /**
   * Create a KiCad symbol instance from a net label with a symbol_name
   * These are treated like power/ground symbols (e.g., vcc_up, ground_down)
   * Uses anchor_position as the primary coordinate source
   */
  private createSymbolFromNetLabel(
    netLabel: any,
    labelText: string,
    symbolName: string,
  ): SchematicSymbol | null {
    if (!this.ctx.c2kMatSch) return null

    // Transform circuit-json coordinates to KiCad coordinates
    // Use anchor_position as primary source, fallback to center if not available
    const { x, y } = applyToPoint(this.ctx.c2kMatSch, {
      x: netLabel.anchor_position?.x ?? netLabel.center?.x ?? 0,
      y: netLabel.anchor_position?.y ?? netLabel.center?.y ?? 0,
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

    // Use Custom library for schematic-symbols symbols
    const libId = `Custom:${symbolName}`
    const symLibId = new SymbolLibId(libId)
    ;(symbol as any)._sxLibId = symLibId

    const isUpSymbol =
      symbolName.includes("_up") || symbolName.toLowerCase().includes("vcc")
    const referenceOffset = isUpSymbol ? -4 : 4
    const valueOffset = isUpSymbol ? -6 : 6

    // Add properties
    const referenceProperty = new SymbolProperty({
      key: "Reference",
      value: labelText, // Use the label text as the reference
      id: 0,
      at: [x, y + referenceOffset, 0],
      effects: this.createTextEffects(1.27, false),
    })

    const valueProperty = new SymbolProperty({
      key: "Value",
      value: labelText,
      id: 1,
      at: [x, y + valueOffset, 0],
      effects: this.createTextEffects(1.27, true),
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
      value: `Power/Net symbol: ${labelText}`,
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

    // Add pin instance (power symbols typically have one pin)
    const pin = new SymbolPin()
    pin.numberString = "1"
    pin.uuid = crypto.randomUUID()
    symbol.pins.push(pin)

    // Add instances section
    const { kicadSch } = this.ctx
    const instances = new SymbolInstances()
    const project = new SymbolInstancesProject("")
    const path = new SymbolInstancePath(`/${kicadSch?.uuid?.value || ""}`)
    path.reference = labelText
    path.unit = 1
    project.paths.push(path)
    instances.projects.push(project)
    symbol._sxInstances = instances

    return symbol
  }

  /**
   * Create a KiCad global label from a schematic_net_label without a symbol_name
   * Uses anchor_position as the primary coordinate source for the arrow anchor point
   */
  private createGlobalLabel(
    netLabel: any,
    labelText: string,
  ): GlobalLabel | null {
    if (!this.ctx.c2kMatSch || !this.ctx.kicadSch) return null

    // Transform circuit-json coordinates to KiCad coordinates
    // Use anchor_position as primary source, fallback to center if not available
    const { x, y } = applyToPoint(this.ctx.c2kMatSch, {
      x: netLabel.anchor_position?.x ?? netLabel.center?.x ?? 0,
      y: netLabel.anchor_position?.y ?? netLabel.center?.y ?? 0,
    })

    // Map anchor_side to KiCad angle and justify
    const anchorSide = netLabel.anchor_side || "left"
    const angleMap: Record<string, number> = {
      left: 0, // Anchor on left, arrow points right
      right: 180, // Anchor on right, arrow points left
      top: 270, // Anchor on top, arrow points down
      bottom: 90, // Anchor on bottom, arrow points up
    }
    const angle = angleMap[anchorSide] || 0

    // Justify matches the arrow direction
    const justifyMap: Record<
      string,
      { horizontal?: "left" | "right"; vertical?: "top" | "bottom" }
    > = {
      left: { horizontal: "left" }, // Anchor on left, text on left
      right: { horizontal: "right" }, // Anchor on right, text on right
      top: { vertical: "top" }, // Anchor on top, text on top
      bottom: { vertical: "bottom" }, // Anchor on bottom, text on bottom
    }
    const justify = justifyMap[anchorSide] || {}

    // Create text effects with justify
    const effects = this.createTextEffects(1.27, false)
    if (Object.keys(justify).length > 0) {
      effects.justify = new TextEffectsJustify(justify)
    }

    const globalLabel = new GlobalLabel({
      value: labelText,
      at: [x, y, angle],
      effects: effects,
      uuid: crypto.randomUUID(),
      fieldsAutoplaced: true,
    })

    return globalLabel
  }

  /**
   * Creates text effects for properties and labels
   */
  private createTextEffects(size: number, hide = false): TextEffects {
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
