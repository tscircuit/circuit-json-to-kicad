import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { getNativeNetParity } from "../fixtures/get-native-net-conflicts"
import {
  expectValidSourceRows,
  readPcb,
  removeConnectivityKeys,
} from "../fixtures/keyless-net-parity"

test("keyless traces sharing a port form one net without joining an independent connection", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="50mm" height="25mm" routingDisabled schMaxTraceDistance={100}>
      <resistor name="R1" resistance="1k" footprint="0603" schX={-8} />
      <resistor name="R2" resistance="1k" footprint="0603" schX={0} schY={-4} />
      <capacitor
        name="C1"
        capacitance="1uF"
        footprint="0603"
        schX={0}
        schY={4}
      />
      <resistor name="R3" resistance="1k" footprint="0603" schX={8} schY={-4} />
      <capacitor
        name="C2"
        capacitance="1uF"
        footprint="0603"
        schX={14}
        schY={-4}
      />
      <trace from=".R1 > .pin2" to=".R2 > .pin1" />
      <trace from=".R1 > .pin2" to=".C1 > .pin1" />
      <trace from=".R3 > .pin2" to=".C2 > .pin1" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  removeConnectivityKeys(circuitJson)
  expectValidSourceRows(circuitJson)
  expect(circuitJson.filter((row) => row.type === "source_net")).toHaveLength(0)
  const traces = circuitJson.filter((row) => row.type === "source_trace")
  expect(traces).toHaveLength(3)
  const occurrences = new Map<string, number>()
  for (const trace of traces) {
    expect(trace.subcircuit_connectivity_map_key).toBeUndefined()
    expect(trace.connected_source_net_ids).toEqual([])
    expect(trace.connected_source_port_ids).toHaveLength(2)
    for (const portId of trace.connected_source_port_ids)
      occurrences.set(portId, (occurrences.get(portId) ?? 0) + 1)
  }
  expect([...occurrences.values()].filter((count) => count === 2)).toHaveLength(
    1,
  )
  expect(occurrences.size).toBe(5)

  const { conflicts, nets } = await getNativeNetParity(circuitJson)
  expect(conflicts).toEqual([])
  const fanout = nets.find((net) => net.pins.includes("R1.2"))!
  const independent = nets.find((net) => net.pins.includes("R3.2"))!
  expect(fanout.pins).toEqual(["C1.1", "R1.2", "R2.1"])
  expect(independent.pins).toEqual(["C2.1", "R3.2"])
  expect(fanout.name).not.toBe(independent.name)
  const { pads } = readPcb(circuitJson)
  const net = pads.get("R1.2")!
  expect(net.id).toBeGreaterThan(0)
  for (const pin of ["R2.1", "C1.1"] as const)
    expect(pads.get(pin)?.id).toBe(net.id)
  expect(pads.get("R3.2")?.id).not.toBe(net.id)
  expect(pads.get("C2.1")?.id).toBe(pads.get("R3.2")?.id)
}, 30_000)
