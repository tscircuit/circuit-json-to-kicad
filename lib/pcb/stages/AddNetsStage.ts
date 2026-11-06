import { createBoardOwnerMap, getElementId } from "@tscircuit/circuit-json-util"
import type { CircuitJson } from "circuit-json"
import { getFullConnectivityMapFromCircuitJson } from "circuit-json-to-connectivity-map"
import type { KicadPcb } from "kicadts"
import { PcbNet } from "kicadts"
import { ConverterStage, type PcbNetInfo } from "../../types"
import { resolveKicadPcbNetName } from "../utils/resolveKicadPcbNetName"

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

    const connectivityMap = getFullConnectivityMapFromCircuitJson(this.input)
    const connectivityKeyByConnection = new Map<string, string>()
    const netNameByKey = new Map<string, string>()
    const boardOwnerMap =
      this.ctx.db.pcb_board.list().length > 1
        ? createBoardOwnerMap(this.input)
        : undefined

    const sourceNets = this.ctx.db.source_net?.list() ?? []
    for (const sourceNet of sourceNets) {
      const connectivityKey =
        sourceNet.subcircuit_connectivity_map_key || sourceNet.source_net_id
      if (!connectivityKey) continue

      const netName = resolveKicadPcbNetName({
        candidateName: sourceNet.name || sourceNet.source_net_id,
        connectivityKey,
        boardId: boardOwnerMap?.get(sourceNet.subcircuit_id ?? "")
          ?.pcb_board_id,
      })

      netNameByKey.set(connectivityKey, netName)
      const connection = connectivityMap.getNetConnectedToId(
        sourceNet.source_net_id,
      )
      if (connection && !connectivityKeyByConnection.has(connection)) {
        connectivityKeyByConnection.set(connection, connectivityKey)
      }
    }

    const sourceTraces = this.ctx.db.source_trace?.list() ?? []
    for (const sourceTrace of sourceTraces) {
      let connectivityKey = sourceTrace.subcircuit_connectivity_map_key

      if (!connectivityKey && sourceTrace.connected_source_net_ids?.length) {
        for (const sourceNetId of sourceTrace.connected_source_net_ids) {
          const connectedNet = this.ctx.db.source_net?.get(sourceNetId)
          if (connectedNet) {
            connectivityKey =
              connectedNet.subcircuit_connectivity_map_key ||
              connectedNet.source_net_id
            if (connectivityKey) break
          }
        }
      }

      const traceConnection = sourceTrace.source_trace_id
        ? connectivityMap.getNetConnectedToId(sourceTrace.source_trace_id)
        : undefined

      if (!connectivityKey && traceConnection) {
        connectivityKey = connectivityKeyByConnection.get(traceConnection)
      }

      if (!connectivityKey && sourceTrace.source_trace_id) {
        connectivityKey = sourceTrace.source_trace_id
      }

      if (!connectivityKey) continue

      if (
        traceConnection &&
        !connectivityKeyByConnection.has(traceConnection)
      ) {
        connectivityKeyByConnection.set(traceConnection, connectivityKey)
      }

      if (!netNameByKey.has(connectivityKey)) {
        const netName = resolveKicadPcbNetName({
          candidateName:
            sourceTrace.display_name || sourceTrace.source_trace_id,
          connectivityKey,
          boardId: boardOwnerMap?.get(sourceTrace.subcircuit_id ?? "")
            ?.pcb_board_id,
        })

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
    const netByConnection = new Map<string, PcbNetInfo>()
    for (const [connection, connectivityKey] of connectivityKeyByConnection) {
      const netInfo = this.ctx.pcbNetMap.get(connectivityKey)
      if (netInfo) {
        netByConnection.set(connection, netInfo)
      }
    }
    for (const element of this.input) {
      const elementId = getElementId(element)
      const connectivityKey =
        ("subcircuit_connectivity_map_key" in element &&
          element.subcircuit_connectivity_map_key) ||
        (element.type === "source_net" ? element.source_net_id : undefined) ||
        (element.type === "source_trace"
          ? (element.source_trace_id &&
              connectivityKeyByConnection.get(
                connectivityMap.getNetConnectedToId(element.source_trace_id) ??
                  "",
              )) ||
            element.source_trace_id
          : undefined)
      if (!connectivityKey) continue
      const netInfo = this.ctx.pcbNetMap.get(connectivityKey)
      if (!netInfo) continue

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
