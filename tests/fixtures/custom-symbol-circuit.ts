import type { CircuitJson } from "circuit-json"

export function customSymbolComponent({
  reference,
  name = "Shared",
  center,
  halfWidth = 1,
  pin = { x: 1, y: 0, number: 1, label: "1" },
  text,
  filled = false,
}: {
  reference: string
  name?: string
  center: { x: number; y: number }
  halfWidth?: number
  pin?: { x: number; y: number; number: number; label: string }
  text?: string
  filled?: boolean
}): CircuitJson {
  const sourceId = `source_${reference}`
  const componentId = `component_${reference}`
  const symbolId = `symbol_${reference}`
  const circuit: CircuitJson = [
    {
      type: "source_component",
      source_component_id: sourceId,
      name: reference,
      ftype: "simple_chip",
    },
    {
      type: "schematic_component",
      schematic_component_id: componentId,
      source_component_id: sourceId,
      schematic_symbol_id: symbolId,
      center,
      size: { width: 2 * halfWidth, height: 1 },
      is_box_with_pins: false,
    },
    {
      type: "schematic_symbol",
      schematic_symbol_id: symbolId,
      name,
    },
    {
      type: "schematic_rect",
      schematic_rect_id: `rect_${reference}`,
      schematic_symbol_id: symbolId,
      schematic_component_id: componentId,
      center,
      width: 2 * halfWidth,
      height: 1,
      rotation: 0,
      stroke_width: 0.05,
      is_filled: filled,
      color: "black",
      is_dashed: false,
    },
    {
      type: "source_port",
      source_port_id: `port_${reference}`,
      source_component_id: sourceId,
      name: pin.label,
      pin_number: pin.number,
    },
    {
      type: "schematic_port",
      schematic_port_id: `schematic_port_${reference}`,
      source_port_id: `port_${reference}`,
      schematic_component_id: componentId,
      center: { x: center.x + pin.x, y: center.y + pin.y },
      pin_number: pin.number,
      display_pin_label: pin.label,
    },
  ]
  if (text !== undefined) {
    circuit.push({
      type: "schematic_text",
      schematic_text_id: `text_${reference}`,
      schematic_symbol_id: symbolId,
      schematic_component_id: componentId,
      text,
      position: center,
      font_size: 0.1,
      rotation: 0,
      anchor: "center",
      color: "black",
    })
  }
  return circuit
}
