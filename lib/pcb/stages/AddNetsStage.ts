import { getElementId } from "@tscircuit/circuit-json-util"
import type { CircuitJson } from "circuit-json"
import { getFullConnectivityMapFromCircuitJson } from "circuit-json-to-connectivity-map"
import type { KicadPcb } from "kicadts"
import { PcbNet } from "kicadts"
import {
  type ConverterContext,
  ConverterStage,
  type PcbNetInfo,
} from "../../types"
import {
  getSourceTraceConnectivityKey,
  getUnnamedNetName,
} from "../../utils/getUnnamedNetName"

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
      const connectivityKey = getSourceTraceConnectivityKey(
        this.ctx.db,
        sourceTrace,
      )
      if (!connectivityKey) continue

      if (!netNameByKey.has(connectivityKey)) {
        const netName = getUnnamedNetName(sourceTrace, connectivityKey)

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

    kicadPcb.nets = nets

    this.finished = true
  }

  override getOutput(): KicadPcb {
    return this.ctx.kicadPcb!
  }
}
