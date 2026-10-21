import { symbols } from "schematic-symbols"

interface SchematicSymbolData {
  primitives: Array<
    | {
        type: "text"
        text: string
        x: number
        y: number
        anchor?: string
      }
    | {
        type: "path" | "circle" | "box"
      }
  >
  center?: { x: number; y: number }
}

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
): SchematicSymbolData | undefined => {
  const resolvedSymbolName =
    legacySymbolNameByOrientedSymbolName[symbolName] ?? symbolName

  return symbols[resolvedSymbolName as keyof typeof symbols]
}
