import { expect, test } from "bun:test"
import {
  expectValidSourceRows,
  readPcb,
  removeConnectivityKeys,
  renderResistorCapacitor,
} from "../fixtures/keyless-net-parity"

test("a keyless PCB-only export retains its supplied trace display name", async () => {
  const circuitJson = (await renderResistorCapacitor()).filter(
    (row) => !row.type.startsWith("schematic_"),
  )
  removeConnectivityKeys(circuitJson)
  expectValidSourceRows(circuitJson)
  const traces = circuitJson.filter((row) => row.type === "source_trace")
  expect(traces).toHaveLength(1)
  expect(traces[0]!.subcircuit_connectivity_map_key).toBeUndefined()
  expect(traces[0]!.connected_source_net_ids).toEqual([])
  traces[0]!.display_name = "imported PCB connection"

  const { pcb, pads } = readPcb(circuitJson)
  expect(pcb.nets.map((net) => net.name).sort()).toEqual([
    "",
    "imported PCB connection",
  ])
  const net = pads.get("R1.2")!
  expect(net.id).toBeGreaterThan(0)
  expect(net.name).toBe("imported PCB connection")
  expect(pads.get("C1.1")?.id).toBe(net.id)
  expect(pcb.segments.length).toBeGreaterThan(0)
  expect(pcb.segments.every((segment) => segment.net?.id === net.id)).toBe(true)
})
