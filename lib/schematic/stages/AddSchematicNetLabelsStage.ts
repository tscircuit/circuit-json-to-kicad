import type { CircuitJson, SchematicTrace } from "circuit-json"
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
import { symbols } from "schematic-symbols"
import { calculatePinPosition } from "./utils/calculatePinPosition"
import { getSchematicNetLabelConnectivityKey } from "../../utils/getKicadNetNames"

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

    if (!this.ctx.c2kMatSch) {
      this.finished = true
      return
    }

    const symbols: SchematicSymbol[] = []
    const globalLabels: GlobalLabel[] = []
    const netNames = this.ctx.kicadNetNames ?? new Map<string, string>()
    const namedKeys = new Set(
      db.source_net
        .list()
        .map((net) => net.subcircuit_connectivity_map_key || net.source_net_id),
    )

    for (const netLabel of netLabels) {
      const key = getSchematicNetLabelConnectivityKey(db, netLabel)
      if (key) namedKeys.add(key)
      const labelText =
        (key ? netNames.get(key) : undefined) ?? netLabel.text ?? ""
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

    for (const trace of db.schematic_trace.list()) {
      const key = trace.subcircuit_connectivity_map_key
      if (!key || namedKeys.has(key) || !netNames.has(key)) continue
      // Prefer the longest wire to leave room for the generated label.
      const length = (edge: SchematicTrace["edges"][number]) =>
        Math.hypot(edge.to.x - edge.from.x, edge.to.y - edge.from.y)
      const edge = [...trace.edges].sort((a, b) => length(b) - length(a))[0]
      if (!edge) continue
      const label = this.createGlobalLabel(
        {
          anchor_position: {
            x: (edge.from.x + edge.to.x) / 2,
            y: (edge.from.y + edge.to.y) / 2,
          },
          anchor_side: edge.from.x === edge.to.x ? "left" : "bottom",
        },
        netNames.get(key)!,
      )
      if (label) globalLabels.push(label)
    }
    for (const port of db.schematic_port.list()) {
      const name = netNames.get(port.source_port_id)
      if (!name) continue
      const label = this.createGlobalLabel(
        {
          anchor_position: port.center,
          anchor_side: {
            left: "right",
            right: "left",
            up: "bottom",
            down: "top",
          }[port.facing_direction ?? "right"],
        },
        name,
      )
      if (label) globalLabels.push(label)
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

    const anchorPoint = {
      x: netLabel.anchor_position?.x ?? netLabel.center?.x ?? 0,
      y: netLabel.anchor_position?.y ?? netLabel.center?.y ?? 0,
    }

    const anchorInKicad = applyToPoint(this.ctx.c2kMatSch, anchorPoint)
    let { x, y } = anchorInKicad

    const symbolData = symbols[symbolName as keyof typeof symbols]
    const port = symbolData?.ports?.[0]
    if (port) {
      const pinPosition = calculatePinPosition({
        port,
        center: symbolData.center,
        size: symbolData.size,
        isChip: false,
        schematicPorts: [],
        c2kMatSchScale: this.ctx.kicadSchematicScaleFactor ?? 1,
      })
      x -= pinPosition.x
      y += pinPosition.y
    }

    const reference = `#PWR${netLabel.schematic_net_label_id}`
    const uuid = crypto.randomUUID()

    const symbol = new SchematicSymbol({
      at: [x, y, 0],
      unit: 1,
      excludeFromSim: false,
      inBom: false,
      onBoard: false,
      dnp: false,
      uuid: uuid,
      fieldsAutoplaced: false,
    })

    // Use Custom library for schematic-symbols symbols
    const libId = `Custom:${symbolName}`
    const symLibId = new SymbolLibId(libId)
    ;(symbol as any)._sxLibId = symLibId

    const isUpSymbol =
      symbolName.includes("_up") || symbolName.toLowerCase().includes("vcc")
    const referenceOffset = isUpSymbol ? -4 : 4

    // Add properties
    const referenceProperty = new SymbolProperty({
      key: "Reference",
      value: reference,
      id: 0,
      at: [x, y + referenceOffset, 0],
      effects: this.createTextEffects(1.27, true),
    })

    const valueProperty = new SymbolProperty({
      key: "Value",
      value: labelText,
      id: 1,
      at: [x, y + referenceOffset, 0],
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
    const instancePathPrefix =
      this.ctx.symbolInstancePathPrefix ?? `/${kicadSch?.uuid?.value || ""}`
    const path = new SymbolInstancePath(instancePathPrefix)
    path.reference = reference
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

    // circuit-json anchor_side is "which edge of the label is attached to net".
    // KiCad justify is applied in text-local coordinates (after rotation), so
    // top/bottom anchors for rotated labels (90/270) map to horizontal justify.
    // This table encodes the canonical circuit-json -> KiCad global-label
    // orientation mapping used by the converter.
    const anchorSide = netLabel.anchor_side || "left"
    const orientationMap: Record<
      string,
      {
        angle: number
        shape: "input" | "output" | "bidirectional" | "tri_state"
        justify: { horizontal?: "left" | "right"; vertical?: "top" | "bottom" }
      }
    > = {
      left: {
        angle: 0,
        shape: "input",
        justify: { horizontal: "left" },
      },
      right: {
        angle: 180,
        shape: "input",
        justify: { horizontal: "right" },
      },
      top: {
        angle: 270,
        shape: "input",
        justify: { horizontal: "right" },
      },
      bottom: {
        angle: 90,
        shape: "input",
        justify: { horizontal: "left" },
      },
    }
    const orientation = orientationMap[anchorSide] || orientationMap["left"]!

    // Create text effects with justify
    const effects = this.createTextEffects(1.27, false)
    if (Object.keys(orientation.justify).length > 0) {
      effects.justify = new TextEffectsJustify(orientation.justify)
    }

    const globalLabel = new GlobalLabel({
      value: labelText,
      shape: orientation.shape,
      at: [x, y, orientation.angle],
      effects: effects,
      uuid: crypto.randomUUID(),
      // Keep the label anchor supplied by Circuit JSON instead of allowing
      // KiCad to reposition it when the schematic is opened.
      fieldsAutoplaced: false,
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
