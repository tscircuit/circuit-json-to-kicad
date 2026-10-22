import type { CircuitJson } from "circuit-json"
import { getElementId } from "@tscircuit/circuit-json-util"
import { getFullConnectivityMapFromCircuitJson } from "circuit-json-to-connectivity-map"
import type { KicadPcb } from "kicadts"
import { PcbNet } from "kicadts"
import { getSchematicNetNames } from "../getSchematicNetNames"
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

    const connectivityMap = getFullConnectivityMapFromCircuitJson(this.input)
    const schematicNames = getSchematicNetNames(this.input, connectivityMap)
    const existingKeys = new Set(netNameByKey.keys())
    const pcbSourcePorts = new Set(
      this.ctx.db.pcb_port.list().map((port) => port.source_port_id),
    )
    for (const element of this.input) {
      // A schematic-only pin can name an existing net, but it must not create
      // an unused PCB net when there is no corresponding footprint port.
      if (
        element.type === "source_port" &&
        !pcbSourcePorts.has(element.source_port_id)
      )
        continue
      const name = schematicNames.get(getElementId(element))
      if (!name) continue
      const key =
        ("subcircuit_connectivity_map_key" in element &&
          element.subcircuit_connectivity_map_key) ||
        (element.type === "source_net" ? element.source_net_id : undefined) ||
        (element.type === "source_port" ? element.source_port_id : undefined)
      if (key) netNameByKey.set(key, name)
    }

    // Append newly discovered (including unused-pin) nets after existing ones,
    // keeping the old numeric codes stable wherever possible.
    const sortedEntries = Array.from(netNameByKey.entries()).sort(
      (a, b) =>
        Number(!existingKeys.has(a[0])) - Number(!existingKeys.has(b[0])) ||
        a[0].localeCompare(b[0]),
    )

    const nets: PcbNet[] = []
    nets.push(new PcbNet(0, ""))

    const netBySchematicName = new Map<string, PcbNetInfo>()
    const resolvedNames = new Set(schematicNames.values())
    let netNumber = 1
    for (const [connectivityKey, netName] of sortedEntries) {
      const existing = netBySchematicName.get(netName)
      if (existing) {
        this.ctx.pcbNetMap.set(connectivityKey, existing)
        continue
      }
      const pcbNet = new PcbNet(netNumber, netName)
      nets.push(pcbNet)

      const netInfo: PcbNetInfo = { id: netNumber, name: netName }
      this.ctx.pcbNetMap.set(connectivityKey, netInfo)
      if (resolvedNames.has(netName)) netBySchematicName.set(netName, netInfo)

      netNumber++
    }

    // Index the existing KiCad nets by Circuit JSON element ID as well.
    const netByConnection = new Map<string, PcbNetInfo>()
    for (const element of this.input) {
      const connectivityKey =
        ("subcircuit_connectivity_map_key" in element &&
          element.subcircuit_connectivity_map_key) ||
        (element.type === "source_net" ? element.source_net_id : undefined) ||
        (element.type === "source_port" ? element.source_port_id : undefined)
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

    this.ctx.pcbSchematicPortNets = new Map()
    for (const port of this.ctx.db.source_port.list()) {
      if (!schematicNames.has(port.source_port_id)) continue
      const netInfo = this.ctx.pcbNetMap.get(port.source_port_id)
      if (netInfo)
        this.ctx.pcbSchematicPortNets.set(port.source_port_id, netInfo)
    }

    kicadPcb.nets = nets

    this.finished = true
  }

  override getOutput(): KicadPcb {
    return this.ctx.kicadPcb!
  }
}
