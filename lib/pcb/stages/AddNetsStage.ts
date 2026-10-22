import type { CircuitJson } from "circuit-json"
import { getElementId } from "@tscircuit/circuit-json-util"
import { getFullConnectivityMapFromCircuitJson } from "circuit-json-to-connectivity-map"
import type { KicadPcb } from "kicadts"
import { PcbNet } from "kicadts"
import {
  getKicadNetNames,
  getSourcePortNetKey,
  getSourceTraceNetKey,
  getUnconnectedPortNetKey,
} from "../../utils/getKicadNetNames"
import {
  ConverterStage,
  type ConverterContext,
  type PcbNetInfo,
} from "../../types"

/**
 * Adds nets to the PCB from circuit JSON connections
 */
export class AddNetsStage extends ConverterStage<CircuitJson, KicadPcb> {
  override _step(): void {
    const { kicadPcb } = this.ctx

    if (!kicadPcb) {
      throw new Error("KicadPcb instance not initialized in context")
    }

    // Initialize the net map in context if it doesn't exist
    this.ctx.pcbNetMap = new Map()

    const netNameByKey = getKicadNetNames(this.ctx.db)

    const sortedEntries = Array.from(netNameByKey.entries()).sort((a, b) => {
      // Preserve existing connected-net numbers when adding isolated pins.
      const isolatedOrder =
        Number(a[0].startsWith("unconnected:")) -
        Number(b[0].startsWith("unconnected:"))
      return isolatedOrder || a[0].localeCompare(b[0])
    })

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
    for (const element of this.input) {
      const connectivityKey =
        ("subcircuit_connectivity_map_key" in element &&
          element.subcircuit_connectivity_map_key) ||
        (element.type === "source_net"
          ? element.source_net_id
          : element.type === "source_trace"
            ? getSourceTraceNetKey(element, this.ctx.db)
            : undefined)
      if (!connectivityKey) continue
      const netInfo = this.ctx.pcbNetMap.get(connectivityKey)
      if (!netInfo) continue

      const elementId = getElementId(element)
      this.ctx.pcbNetMap.set(elementId, netInfo)
    }
    for (const trace of this.ctx.db.source_trace.list()) {
      const net = this.ctx.pcbNetMap.get(trace.source_trace_id)
      if (!net) continue
      for (const id of trace.connected_source_port_ids ?? []) {
        if (!this.ctx.pcbNetMap.has(id)) this.ctx.pcbNetMap.set(id, net)
      }
    }
    for (const port of this.ctx.db.source_port.list()) {
      if (this.ctx.pcbNetMap.has(port.source_port_id)) continue
      const key = getSourcePortNetKey(port.source_port_id, this.ctx.db)
      const net =
        (key ? this.ctx.pcbNetMap.get(key) : undefined) ??
        this.ctx.pcbNetMap.get(getUnconnectedPortNetKey(port.source_port_id))
      if (net) this.ctx.pcbNetMap.set(port.source_port_id, net)
    }
    for (const port of this.ctx.db.pcb_port.list()) {
      const net = port.source_port_id
        ? this.ctx.pcbNetMap.get(port.source_port_id)
        : undefined
      if (net && !this.ctx.pcbNetMap.has(port.pcb_port_id))
        this.ctx.pcbNetMap.set(port.pcb_port_id, net)
    }
    for (const trace of this.ctx.db.pcb_trace.list()) {
      const net = trace.source_trace_id
        ? this.ctx.pcbNetMap.get(trace.source_trace_id)
        : undefined
      if (net && !this.ctx.pcbNetMap.has(trace.pcb_trace_id))
        this.ctx.pcbNetMap.set(trace.pcb_trace_id, net)
    }
    for (const via of this.ctx.db.pcb_via.list()) {
      if (this.ctx.pcbNetMap.has(via.pcb_via_id)) continue
      const net =
        (via.source_net_id
          ? this.ctx.pcbNetMap.get(via.source_net_id)
          : undefined) ??
        (via.source_trace_id
          ? this.ctx.pcbNetMap.get(via.source_trace_id)
          : undefined) ??
        (via.pcb_trace_id
          ? this.ctx.pcbNetMap.get(via.pcb_trace_id)
          : undefined)
      if (net) this.ctx.pcbNetMap.set(via.pcb_via_id, net)
    }

    // Use physical connectivity only to fill missing element aliases. A copper
    // bridge with conflicting source nets cannot provide an unambiguous net.
    const netByConnection = new Map<string, PcbNetInfo>()
    const ambiguousConnections = new Set<string>()
    for (const [elementId, connection] of Object.entries(
      connectivityMap.idToNetMap,
    )) {
      const net = this.ctx.pcbNetMap.get(elementId)
      if (!net || ambiguousConnections.has(connection)) continue
      const existing = netByConnection.get(connection)
      if (existing && existing.id !== net.id) {
        ambiguousConnections.add(connection)
        netByConnection.delete(connection)
      } else {
        netByConnection.set(connection, net)
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

    kicadPcb.nets = nets

    this.finished = true
  }

  override getOutput(): KicadPcb {
    return this.ctx.kicadPcb!
  }
}
