import type { CircuitJson } from "circuit-json"
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

    kicadPcb.nets = nets

    this.finished = true
  }

  override getOutput(): KicadPcb {
    return this.ctx.kicadPcb!
  }
}
