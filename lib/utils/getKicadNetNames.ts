import type { CircuitJsonUtilObjects } from "@tscircuit/circuit-json-util"
import type { SourceTrace } from "circuit-json"
import { buildSchematicSheetPlan } from "../schematic/buildSchematicSheetPlan"
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

/** Local labels already name their connection; do not supersede them globally. */
export function getInlineTraceNetNames(db: CircuitJsonUtilObjects) {
  const sheetNames = new Map(
    buildSchematicSheetPlan(db.schematic_sheet.list()).children.map((sheet) => [
      sheet.schematicSheetId,
      sheet.sheetName,
    ]),
  )
  const globalKeys = new Set<string>()
  for (const label of db.schematic_net_label.list()) {
    if (!label.source_net_id) continue
    const net = db.source_net.get(label.source_net_id)
    if (net)
      globalKeys.add(net.subcircuit_connectivity_map_key || net.source_net_id)
  }

  const localNamesByKey = new Map<string, Set<string>>()
  for (const text of db.schematic_text.list()) {
    if (
      !text.source_trace_id ||
      text.schematic_component_id ||
      ("schematic_symbol_id" in text && text.schematic_symbol_id)
    )
      continue
    const trace = db.source_trace.get(text.source_trace_id)
    const key = trace ? getSourceTraceNetKey(trace, db) : undefined
    if (!key) continue
    const names = localNamesByKey.get(key) ?? new Set<string>()
    const sheetName = text.schematic_sheet_id
      ? sheetNames.get(text.schematic_sheet_id)
      : undefined
    if (!text.schematic_sheet_id || sheetName !== undefined) {
      names.add(
        `${sheetName === undefined ? "" : `/${sheetName}`}/${text.text}`,
      )
    }
    localNamesByKey.set(key, names)
  }

  const names = new Map<string, string>()
  for (const [key, localNames] of localNamesByKey) {
    // A global/power symbol wins over local aliases. Multiple local names or
    // sheet paths have no single canonical PCB name: keep the existing name
    // rather than guessing from whichever text happens to appear first.
    if (!globalKeys.has(key) && localNames.size === 1) {
      names.set(key, [...localNames][0]!)
    }
  }
  // Skip the existing automatic connection labels only when a single local
  // canonical name or an actual global/power label supplies that connection.
  // Ambiguous aliases must not disconnect stubs that previously shared a net.
  const keys = new Set(
    [...localNamesByKey.keys()].filter(
      (key) => names.has(key) || globalKeys.has(key),
    ),
  )
  return { keys, names }
}

/** Both exporters must use the same names, including before sheet partitioning. */
export function getKicadNetNames(
  db: CircuitJsonUtilObjects,
  inlineNames = getInlineTraceNetNames(db),
) {
  const names = new Map<string, string>()
  const hasSchematic = db.schematic_component.list().length > 0
  for (const net of db.source_net.list()) {
    const key = net.subcircuit_connectivity_map_key || net.source_net_id
    const candidate = net.name || net.source_net_id || ""
    names.set(key, candidate.trim() ? candidate : key)
  }
  for (const [key, name] of inlineNames.names) names.set(key, name)

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
