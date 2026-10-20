import type { CircuitJsonUtilObjects } from "@tscircuit/circuit-json-util"
import type { SchematicNetLabel } from "circuit-json"

export function getSchematicNetLabelConnectivityKey(
  db: CircuitJsonUtilObjects,
  label: SchematicNetLabel,
): string | undefined {
  const net = label.source_net_id
    ? db.source_net.get(label.source_net_id)
    : undefined
  const trace = label.source_trace_id
    ? db.source_trace.get(label.source_trace_id)
    : undefined
  return (
    net?.subcircuit_connectivity_map_key ||
    net?.source_net_id ||
    trace?.subcircuit_connectivity_map_key ||
    label.source_net_id
  )
}

/** Resolve net names once for both KiCad exports, keyed by connectivity. */
export function getKicadNetNames(
  db: CircuitJsonUtilObjects,
): Map<string, string> {
  const netNameByKey = new Map<string, string>()

  const sourceNets = db.source_net?.list() ?? []
  for (const sourceNet of sourceNets) {
    const connectivityKey =
      sourceNet.subcircuit_connectivity_map_key || sourceNet.source_net_id
    if (!connectivityKey) continue

    const candidateName = sourceNet.name || sourceNet.source_net_id || ""
    const netName =
      candidateName && candidateName.trim().length > 0
        ? candidateName
        : connectivityKey

    netNameByKey.set(connectivityKey, netName)
  }

  // Imported schematics can name a connection with a label without a
  // corresponding source_net row. Reuse that name before generating one.
  for (const label of db.schematic_net_label.list()) {
    const key = getSchematicNetLabelConnectivityKey(db, label)
    if (key && label.text && !netNameByKey.has(key)) {
      netNameByKey.set(key, label.text)
    }
  }
  const namedKeys = new Set(netNameByKey.keys())
  const sourceTraces = db.source_trace?.list() ?? []
  for (const sourceTrace of sourceTraces) {
    let connectivityKey = sourceTrace.subcircuit_connectivity_map_key

    if (!connectivityKey && sourceTrace.connected_source_net_ids?.length) {
      for (const sourceNetId of sourceTrace.connected_source_net_ids) {
        const connectedNet = db.source_net?.get(sourceNetId)
        if (
          connectedNet?.subcircuit_connectivity_map_key &&
          connectedNet.subcircuit_connectivity_map_key.length > 0
        ) {
          connectivityKey = connectedNet.subcircuit_connectivity_map_key
          break
        }
      }
    }

    if (!connectivityKey) continue

    if (!netNameByKey.has(connectivityKey)) {
      const candidateName =
        sourceTrace.display_name || sourceTrace.source_trace_id || ""
      const netName =
        candidateName && candidateName.trim().length > 0
          ? candidateName
          : connectivityKey

      netNameByKey.set(connectivityKey, netName)
    }
  }

  // Isolated pins still have nets in a KiCad schematic. Give each one an
  // explicit name so both exports agree without copying KiCad's auto-naming.
  const schematicPorts = new Set(
    db.schematic_port.list().map((port) => port.source_port_id),
  )
  if (schematicPorts.size > 0) {
    const connectedPorts = new Set(
      sourceTraces.flatMap((trace) => trace.connected_source_port_ids),
    )
    for (const pcbPort of db.pcb_port.list()) {
      const port = db.source_port.get(pcbPort.source_port_id)
      if (
        !port ||
        !schematicPorts.has(port.source_port_id) ||
        port.subcircuit_connectivity_map_key ||
        connectedPorts.has(port.source_port_id)
      )
        continue
      const component = port.source_component_id
        ? db.source_component.get(port.source_component_id)
        : undefined
      netNameByKey.set(
        port.source_port_id,
        `unconnected-(${component?.name || port.source_port_id}-${port.name})`,
      )
    }
  }

  // Global labels join equal names even across sheets. Generated names must
  // therefore be unique without changing explicitly named source nets.
  const usedNames = new Set([...namedKeys].map((key) => netNameByKey.get(key)!))
  const reservedNames = new Set(netNameByKey.values())
  for (const [key, name] of netNameByKey) {
    if (namedKeys.has(key)) continue
    let uniqueName = name
    let suffix = 2
    if (usedNames.has(uniqueName)) {
      do {
        uniqueName = `${name}_${suffix++}`
      } while (usedNames.has(uniqueName) || reservedNames.has(uniqueName))
    }
    netNameByKey.set(key, uniqueName)
    usedNames.add(uniqueName)
  }

  return netNameByKey
}
