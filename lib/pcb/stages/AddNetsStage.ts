import type { CircuitJson } from "circuit-json"
import { getElementId } from "@tscircuit/circuit-json-util"
import { getFullConnectivityMapFromCircuitJson } from "circuit-json-to-connectivity-map"
import type { KicadPcb } from "kicadts"
import { PcbNet } from "kicadts"
import { getKicadNetNames } from "../../utils/getKicadNetNames"
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
