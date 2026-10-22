import type { Point, SchematicComponent, SchematicPort } from "circuit-json"
import { type SchSymbol, symbols } from "schematic-symbols"

const legacySymbolNameByOrientedSymbolName: Record<string, string> = {
  n_channel_e_mosfet_transistor_gate_left_drain_top:
    "n_channel_e_mosfet_transistor_horz",
  n_channel_e_mosfet_transistor_gate_top_drain_right:
    "n_channel_e_mosfet_transistor_vert",
  n_channel_d_mosfet_transistor_gate_left_drain_top:
    "n_channel_d_mosfet_transistor_horz",
  n_channel_d_mosfet_transistor_gate_top_drain_right:
    "n_channel_d_mosfet_transistor_vert",
  p_channel_e_mosfet_transistor_gate_left_drain_top:
    "p_channel_e_mosfet_transistor_horz",
  p_channel_e_mosfet_transistor_gate_top_drain_right:
    "p_channel_e_mosfet_transistor_vert",
  p_channel_d_mosfet_transistor_gate_left_drain_top:
    "p_channel_d_mosfet_transistor_horz",
  p_channel_d_mosfet_transistor_gate_top_drain_right:
    "p_channel_d_mosfet_transistor_vert",
}

export const getSchematicSymbolData = (
  symbolName: string,
  placement?: {
    schematicComponent: SchematicComponent
    schematicPorts: SchematicPort[]
  },
): SchSymbol | undefined => {
  const resolvedSymbolName =
    legacySymbolNameByOrientedSymbolName[symbolName] ?? symbolName

  const symbol = symbols[resolvedSymbolName as keyof typeof symbols]
  if (!symbol || !placement || symbol.ports.length === 0) return symbol

  const { schematicComponent, schematicPorts } = placement
  const componentPorts = schematicPorts
    .filter(
      (port) =>
        port.schematic_component_id ===
        schematicComponent.schematic_component_id,
    )
    .map((port) => ({
      x: port.center.x - schematicComponent.center.x,
      y: port.center.y - schematicComponent.center.y,
    }))
  if (componentPorts.length === 0) return symbol

  // A library update can change the symbol origin without changing its port
  // layout. Recover the original origin from Circuit JSON so the drawing,
  // pins, and fallback fields stay aligned with the existing traces.
  const center = {
    x:
      Math.min(...symbol.ports.map((port) => port.x)) -
      Math.min(...componentPorts.map((port) => port.x)),
    y:
      Math.min(...symbol.ports.map((port) => port.y)) -
      Math.min(...componentPorts.map((port) => port.y)),
  }
  const translatedPorts = symbol.ports.map((port) => ({
    x: port.x - center.x,
    y: port.y - center.y,
  }))
  const samePosition = (a: Point, b: Point) =>
    Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6

  // Require the complete layout to agree up to translation. Multiple physical
  // pins may share a terminal, as on a four-pin pushbutton.
  if (
    !translatedPorts.every((a) =>
      componentPorts.some((b) => samePosition(a, b)),
    ) ||
    !componentPorts.every((a) =>
      translatedPorts.some((b) => samePosition(a, b)),
    )
  ) {
    return symbol
  }

  return samePosition(center, symbol.center) ? symbol : { ...symbol, center }
}
