import type { CircuitJsonUtilObjects } from "@tscircuit/circuit-json-util"
import type { SourceTrace } from "circuit-json"
import { getPhysicalPinName } from "./getPhysicalPinName"

export const getUnconnectedPortNetKey = (sourcePortId: string) =>
  `unconnected:${sourcePortId}`

export function getSourceTraceNetKey(
  trace: SourceTrace,
  db: CircuitJsonUtilObjects,
): string | undefined {
  if (trace.subcircuit_connectivity_map_key)
    return trace.subcircuit_connectivity_map_key
  for (const id of trace.connected_source_net_ids ?? []) {
    const net = db.source_net.get(id)
    if (net) return net.subcircuit_connectivity_map_key || net.source_net_id
  }
}

export function getNamedNetKeys(db: CircuitJsonUtilObjects) {
  return new Set(
    db.source_net
      .list()
      .map((net) => net.subcircuit_connectivity_map_key || net.source_net_id),
  )
}

/** Both exporters must use the same names, including before sheet partitioning. */
export function getKicadNetNames(db: CircuitJsonUtilObjects) {
  const names = new Map<string, string>()
  const hasSchematic = db.schematic_component.list().length > 0
  for (const net of db.source_net.list()) {
    const key = net.subcircuit_connectivity_map_key || net.source_net_id
    const candidate = net.name || net.source_net_id || ""
    names.set(key, candidate.trim() ? candidate : key)
  }

  const usedNames = new Set(names.values())
  const addAutomaticName = (key: string, candidate: string) => {
    if (names.has(key)) return
    const base = candidate.trim() ? candidate : key
    let name = base
    let suffix = 1
    // A generated label must not join an unrelated named net or another sheet.
    while (usedNames.has(name)) name = `${base}__${suffix++}`
    names.set(key, name)
    usedNames.add(name)
  }

  const keysByPort = new Map<string, Set<string>>()
  for (const trace of db.source_trace.list()) {
    const key = getSourceTraceNetKey(trace, db)
    if (!key) continue
    const connectedPortIds = trace.connected_source_port_ids ?? []
    const firstPort = connectedPortIds
      .map((id) => db.source_port.get(id))
      .find((port) => port?.source_component_id)
    const component = firstPort?.source_component_id
      ? db.source_component.get(firstPort.source_component_id)
      : undefined
    const pin = firstPort
      ? (getPhysicalPinName(firstPort) ??
        firstPort.pin_number ??
        firstPort.name)
      : undefined
    addAutomaticName(
      key,
      hasSchematic && component?.name && pin != null
        ? `Net-(${component.name}-Pad${pin})`
        : trace.display_name || trace.source_trace_id,
    )
    for (const portId of connectedPortIds) {
      const keys = keysByPort.get(portId) ?? new Set<string>()
      keys.add(key)
      keysByPort.set(portId, keys)
    }
  }

  // KiCad assigns a net even to a single isolated pin. Keep those pads in the
  // shared naming scheme rather than exporting them as PCB net zero.
  const schematicSourcePorts = new Set(
    db.schematic_port.list().map((port) => port.source_port_id),
  )
  for (const pcbPort of db.pcb_port.list()) {
    if (!pcbPort.source_port_id) continue
    if (!schematicSourcePorts.has(pcbPort.source_port_id)) continue
    const port = db.source_port.get(pcbPort.source_port_id)
    if (!port) continue
    const keys = [
      ...(keysByPort.get(port.source_port_id) ?? []),
      port.subcircuit_connectivity_map_key,
    ]
    if (keys.some((key) => key && names.has(key))) continue
    const component = port.source_component_id
      ? db.source_component.get(port.source_component_id)
      : undefined
    const reference =
      component?.name || port.source_component_id || port.source_port_id
    const pin = getPhysicalPinName(port) ?? port.pin_number ?? port.name
    addAutomaticName(
      getUnconnectedPortNetKey(port.source_port_id),
      `unconnected-(${reference}-Pad${pin})`,
    )
  }
  return names
}
