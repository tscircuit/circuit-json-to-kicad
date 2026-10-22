import type { CircuitJson } from "circuit-json"
import { getElementId } from "@tscircuit/circuit-json-util"
import {
  getFullConnectivityMapFromCircuitJson,
  getSourcePortConnectivityMapFromCircuitJson,
} from "circuit-json-to-connectivity-map"
import type { KicadPcb } from "kicadts"
import { PcbNet } from "kicadts"
import {
  ConverterStage,
  type ConverterContext,
  type PcbNetInfo,
} from "../../types"

/**
 * Adds nets to the PCB from circuit JSON connections
 */
export class AddNetsStage extends ConverterStage<CircuitJson, KicadPcb> {
  private addPcbPortNets(): void {
    const { db, pcbNetMap } = this.ctx
    if (!pcbNetMap) throw new Error("PCB net map not initialized in context")

    const sourcePortNetKeys: Record<string, string[]> = Object.create(null)
    // Imported ports may have trace membership without connectivity keys.
    for (const trace of db.source_trace.list()) {
      const keys = [
        trace.subcircuit_connectivity_map_key,
        ...(trace.connected_source_net_ids ?? []).map((id) => {
          const net = db.source_net.get(id)
          return net?.subcircuit_connectivity_map_key || net?.source_net_id
        }),
      ].filter((key): key is string => Boolean(key))
      for (const portId of trace.connected_source_port_ids ?? []) {
        sourcePortNetKeys[portId] ??= []
        sourcePortNetKeys[portId].push(...keys)
      }
    }

    this.ctx.pcbInternalPortConnections =
      getSourcePortConnectivityMapFromCircuitJson(
        this.input.filter(
          (element) =>
            element.type === "source_component" ||
            element.type === "source_component_internal_connection",
        ),
      )
    // Share existing net keys across declared internal connections, including overlapping groups.
    for (const members of Object.values(
      this.ctx.pcbInternalPortConnections.netMap,
    )) {
      const keys = members
        .flatMap((id) => [
          id,
          ...(sourcePortNetKeys[id] ?? []),
          db.source_port.get(id)?.subcircuit_connectivity_map_key,
        ])
        .filter((key): key is string => Boolean(key))
      for (const id of members) sourcePortNetKeys[id] = keys
    }

    for (const pcbPort of db.pcb_port.list()) {
      // Pad ownership comes from source connections, not nearby PCB copper.
      pcbNetMap.delete(pcbPort.pcb_port_id)
      const sourcePort = db.source_port.get(pcbPort.source_port_id)
      if (!sourcePort) continue
      const keys = [
        ...(sourcePortNetKeys[sourcePort.source_port_id] ?? []),
        sourcePort.subcircuit_connectivity_map_key,
      ]
      const nets: PcbNetInfo[] = []
      for (const key of keys) {
        const net = key ? pcbNetMap.get(key) : undefined
        if (net && !nets.some((existing) => existing.id === net.id)) {
          nets.push(net)
        }
      }
      if (nets.length > 1) {
        const component = sourcePort.source_component_id
          ? db.source_component.get(sourcePort.source_component_id)
          : undefined
        const reference =
          component?.name ||
          sourcePort.source_component_id ||
          pcbPort.pcb_component_id
        throw new Error(
          `Cannot export ${reference} pad ${sourcePort.pin_number ?? sourcePort.name}: multiple KiCad nets (${nets.map((net) => net.name).join(", ")})`,
        )
      }
      if (nets[0]) pcbNetMap.set(pcbPort.pcb_port_id, nets[0])
    }
  }

  override _step(): void {
    const { kicadPcb } = this.ctx

    if (!kicadPcb) {
      throw new Error("KicadPcb instance not initialized in context")
    }

    // Initialize the net map in context if it doesn't exist
    this.ctx.pcbNetMap = new Map()

    const netNameByKey = new Map<string, string>()

    const sourceNets = this.ctx.db.source_net?.list() ?? []
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

    const sourceTraces = this.ctx.db.source_trace?.list() ?? []
    for (const sourceTrace of sourceTraces) {
      let connectivityKey = sourceTrace.subcircuit_connectivity_map_key

      if (!connectivityKey && sourceTrace.connected_source_net_ids?.length) {
        for (const sourceNetId of sourceTrace.connected_source_net_ids) {
          const connectedNet = this.ctx.db.source_net?.get(sourceNetId)
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

    const sortedEntries = Array.from(netNameByKey.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    )

    const nets: PcbNet[] = []
    nets.push(new PcbNet(0, ""))

    let netNumber = 1
    for (const [connectivityKey, netName] of sortedEntries) {
      const pcbNet = new PcbNet(netNumber, netName)
      nets.push(pcbNet)

      const netInfo: PcbNetInfo = { id: netNumber, name: netName }
      this.ctx.pcbNetMap.set(connectivityKey, netInfo)

      netNumber++
    }

    // Index the existing KiCad nets by Circuit JSON element ID as well.
    const connectivityMap = getFullConnectivityMapFromCircuitJson(this.input)
    const netByConnection = new Map<string, PcbNetInfo>()
    for (const element of this.input) {
      const connectivityKey =
        ("subcircuit_connectivity_map_key" in element &&
          element.subcircuit_connectivity_map_key) ||
        (element.type === "source_net" ? element.source_net_id : undefined)
      if (!connectivityKey) continue
      const netInfo = this.ctx.pcbNetMap.get(connectivityKey)
      if (!netInfo) continue

      const elementId = getElementId(element)
      this.ctx.pcbNetMap.set(elementId, netInfo)
      const connection = connectivityMap.getNetConnectedToId(elementId)
      if (connection && !netByConnection.has(connection)) {
        netByConnection.set(connection, netInfo)
      }
    }
    for (const [elementId, connection] of Object.entries(
      connectivityMap.idToNetMap,
    )) {
      const netInfo = netByConnection.get(connection)
      if (netInfo && !this.ctx.pcbNetMap.has(elementId)) {
        this.ctx.pcbNetMap.set(elementId, netInfo)
      }
    }

    this.addPcbPortNets()
    kicadPcb.nets = nets

    this.finished = true
  }

  override getOutput(): KicadPcb {
    return this.ctx.kicadPcb!
  }
}
