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
  Label,
} from "kicadts"
import { applyToPoint } from "transformation-matrix"
import { ConverterStage } from "../../types"

/**
 * Adds schematic net labels (symbols like VCC/GND from schematic-symbols, and text labels) to the schematic
 *
 * Net labels with symbol_name are treated as regular schematic components using schematic-symbols
 * Net labels without symbol_name are treated as text labels
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
    const labels: Label[] = []

    for (const netLabel of netLabels) {
      const labelText = netLabel.text || ""
      const symbolName = netLabel.symbol_name

      if (symbolName) {
        // Create a component symbol using the schematic-symbols symbol
        const symbol = this.createSymbolFromNetLabel(
          netLabel,
          labelText,
          symbolName,
        )
        if (symbol) {
          symbols.push(symbol)
        }
      } else {
        // Create a regular text label
        const label = this.createLabel(netLabel, labelText)
        if (label) {
          labels.push(label)
        }
      }
    }

    // Add symbols to the existing symbols array
    if (kicadSch && symbols.length > 0) {
      const existingSymbols = kicadSch.symbols || []
      kicadSch.symbols = [...existingSymbols, ...symbols]
    }

    // Add labels to the schematic
    if (kicadSch && labels.length > 0) {
      kicadSch.labels = [...(kicadSch.labels || []), ...labels]
    }

    this.finished = true
  }

  /**
   * Create a KiCad symbol instance from a net label with a symbol_name
   * These are treated like regular components (e.g., rail_up, rail_down, vcc_up, ground_down)
   */
  private createSymbolFromNetLabel(
    netLabel: any,
    labelText: string,
    symbolName: string,
  ): SchematicSymbol | null {
    if (!this.ctx.c2kMatSch) return null

    // Transform circuit-json coordinates to KiCad coordinates
    const { x, y } = applyToPoint(this.ctx.c2kMatSch, {
      x: netLabel.center?.x || netLabel.anchor_position?.x || 0,
      y: netLabel.center?.y || netLabel.anchor_position?.y || 0,
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

    // Add properties
    const referenceProperty = new SymbolProperty({
      key: "Reference",
      value: labelText, // Use the label text as the reference
      id: 0,
      at: [x, y - 6, 0],
      effects: this.createTextEffects(1.27, false),
    })

    const valueProperty = new SymbolProperty({
      key: "Value",
      value: labelText,
      id: 1,
      at: [x, y + 6, 0],
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
   * Create a KiCad label from a schematic_net_label without a symbol
   */
  private createLabel(netLabel: any, labelText: string): Label | null {
    if (!this.ctx.c2kMatSch) return null

    // Transform circuit-json coordinates to KiCad coordinates
    const { x, y } = applyToPoint(this.ctx.c2kMatSch, {
      x: netLabel.center?.x || netLabel.anchor_position?.x || 0,
      y: netLabel.center?.y || netLabel.anchor_position?.y || 0,
    })

    const label = new Label({
      value: labelText,
      at: [x, y, 0],
      effects: this.createTextEffects(1.27, false),
      uuid: crypto.randomUUID(),
    })

    return label
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
