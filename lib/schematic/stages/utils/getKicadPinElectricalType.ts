import type { SourcePort } from "circuit-json"
import type { PinElectricalType } from "kicadts"

export function getKicadPinElectricalType(
  sourcePort: SourcePort | undefined,
): PinElectricalType {
  if (!sourcePort) return "passive"

  if (sourcePort.provides_power || sourcePort.provides_ground) {
    return "power_out"
  }
  if (sourcePort.requires_power || sourcePort.requires_ground) {
    return "power_in"
  }
  if (sourcePort.is_using_open_collector || sourcePort.is_using_open_drain) {
    // KiCad uses open-collector for both open-collector and open-drain pins.
    return "open_collector"
  }
  if (sourcePort.is_using_open_emitter) return "open_emitter"
  if (sourcePort.is_using_tri_state) return "tri_state"
  if (sourcePort.is_bidirectional) return "bidirectional"
  if (sourcePort.is_output) return "output"
  if (sourcePort.is_input) return "input"

  return "passive"
}
