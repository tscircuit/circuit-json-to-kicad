import type { CircuitJson } from "circuit-json"
import { getElementId } from "@tscircuit/circuit-json-util"
import { getFullConnectivityMapFromCircuitJson } from "circuit-json-to-connectivity-map"
import type { KicadPcb } from "kicadts"
import { PcbNet } from "kicadts"
import { getSchematicNets, type SchematicNet } from "../getSchematicNets"
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
    const schematicNets = getSchematicNets(this.input)
    const schematicNetByKey = new Map<string, SchematicNet>()
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
      const schematicNet = schematicNets.get(getElementId(element))
      if (!schematicNet) continue
      const key =
        ("subcircuit_connectivity_map_key" in element &&
          element.subcircuit_connectivity_map_key) ||
        (element.type === "source_net" ? element.source_net_id : undefined) ||
        (element.type === "source_port" ? element.source_port_id : undefined)
      if (key) {
        const existing = schematicNetByKey.get(key)
        if (existing && existing !== schematicNet) {
          throw new Error(
            `Cannot export connectivity key ${key}: multiple schematic nets (${existing.name}, ${schematicNet.name})`,
          )
        }
        netNameByKey.set(key, schematicNet.name)
        schematicNetByKey.set(key, schematicNet)
      }
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

    const netBySchematicNet = new Map<SchematicNet, PcbNetInfo>()
    const keyByName = new Map<string, string>()
    let netNumber = 1
    for (const [connectivityKey, netName] of sortedEntries) {
      const schematicNet = schematicNetByKey.get(connectivityKey)
      const existing = schematicNet && netBySchematicNet.get(schematicNet)
      if (existing) {
        this.ctx.pcbNetMap.set(connectivityKey, existing)
        continue
      }
      const conflictingKey = keyByName.get(netName)
      if (conflictingKey !== undefined) {
        throw new Error(
          `Cannot export disconnected nets with the same KiCad name "${netName}" (${conflictingKey}, ${connectivityKey}): KiCad would merge them`,
        )
      }
      keyByName.set(netName, connectivityKey)
      const pcbNet = new PcbNet(netNumber, netName)
      nets.push(pcbNet)

      const netInfo: PcbNetInfo = { id: netNumber, name: netName }
      this.ctx.pcbNetMap.set(connectivityKey, netInfo)
      if (schematicNet) netBySchematicNet.set(schematicNet, netInfo)

      netNumber++
    }

    // Source identities take precedence over PCB connectivity. In particular,
    // a routed bridge cannot override the net assigned to either endpoint.
    for (const [elementId, schematicNet] of schematicNets) {
      const netInfo = netBySchematicNet.get(schematicNet)
      if (netInfo) this.ctx.pcbNetMap.set(elementId, netInfo)
    }

    // Index the existing KiCad nets by Circuit JSON element ID as well.
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
    }

    // Resolve explicit trace/via references before using copper connectivity as
    // a fallback. Missing connectivity keys do not discard the source identity.
    for (const trace of this.ctx.db.pcb_trace.list()) {
      const netInfo = trace.source_trace_id
        ? this.ctx.pcbNetMap.get(trace.source_trace_id)
        : undefined
      if (netInfo && !this.ctx.pcbNetMap.has(trace.pcb_trace_id))
        this.ctx.pcbNetMap.set(trace.pcb_trace_id, netInfo)
    }
    for (const via of this.ctx.db.pcb_via.list()) {
      const id = via.source_net_id || via.source_trace_id || via.pcb_trace_id
      const netInfo = id ? this.ctx.pcbNetMap.get(id) : undefined
      if (netInfo && !this.ctx.pcbNetMap.has(via.pcb_via_id))
        this.ctx.pcbNetMap.set(via.pcb_via_id, netInfo)
    }

    // Copper may infer a missing assignment only when all known assignments
    // agree. Never pick the first net of a physically shorted pair.
    const netsByConnection = new Map<string, Set<PcbNetInfo>>()
    for (const [elementId, connection] of Object.entries(
      connectivityMap.idToNetMap,
    )) {
      const netInfo = this.ctx.pcbNetMap.get(elementId)
      if (!netInfo) continue
      const nets = netsByConnection.get(connection) ?? new Set()
      nets.add(netInfo)
      netsByConnection.set(connection, nets)
    }
    for (const [elementId, connection] of Object.entries(
      connectivityMap.idToNetMap,
    )) {
      const connectedNets = netsByConnection.get(connection)
      const netInfo =
        connectedNets?.size === 1 ? [...connectedNets][0] : undefined
      if (netInfo && !this.ctx.pcbNetMap.has(elementId)) {
        this.ctx.pcbNetMap.set(elementId, netInfo)
      }
    }

    this.ctx.pcbSchematicPortNets = new Map()
    for (const port of this.ctx.db.source_port.list()) {
      if (!schematicNets.has(port.source_port_id)) continue
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
