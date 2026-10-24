import { expect, test } from "bun:test"
import { getNativeNetParity } from "../fixtures/get-native-net-conflicts"
import {
  expectValidSourceRows,
  readPcb,
  removeConnectivityKeys,
  renderResistorCapacitor,
} from "../fixtures/keyless-net-parity"

test("keyless connections preserve native pin membership and routed net assignments", async () => {
  const circuitJson = await renderResistorCapacitor()
  removeConnectivityKeys(circuitJson)
  expectValidSourceRows(circuitJson)
  expect(circuitJson.filter((row) => row.type === "source_net")).toHaveLength(0)
  const traces = circuitJson.filter((row) => row.type === "source_trace")
  expect(traces).toHaveLength(1)
  expect(traces[0]!.subcircuit_connectivity_map_key).toBeUndefined()
  expect(traces[0]!.connected_source_net_ids).toEqual([])
  expect(traces[0]!.connected_source_port_ids).toHaveLength(2)
  const input = JSON.stringify(circuitJson)

  const { conflicts, nets } = await getNativeNetParity(circuitJson)
  expect(conflicts).toEqual([])
  const connected = nets.find((net) => net.pins.includes("R1.2"))!
  expect(connected.pins).toEqual(["C1.1", "R1.2"])
  expect(nets.find((net) => net.pins.includes("R1.1"))?.pins).toEqual(["R1.1"])
  expect(nets.find((net) => net.pins.includes("C1.2"))?.pins).toEqual(["C1.2"])

  const { pcb, pads } = readPcb(circuitJson)
  const net = pads.get("R1.2")!
  expect(net.id).toBeGreaterThan(0)
  expect(net.name).toBe(connected.name)
  expect(pads.get("C1.1")?.id).toBe(net.id)
  expect(pads.get("C1.1")?.name).toBe(connected.name)
  expect(pcb.segments.length).toBeGreaterThan(0)
  expect(pcb.segments.every((segment) => segment.net?.id === net.id)).toBe(true)
  expect(JSON.stringify(circuitJson)).toBe(input)
}, 30_000)
