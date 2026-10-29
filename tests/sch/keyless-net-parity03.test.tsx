import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { getNativeNetParity } from "../fixtures/get-native-net-conflicts"
import { expectValidSourceRows, readPcb } from "../fixtures/keyless-net-parity"

test("a keyless branch inherits the existing named connection through its shared port", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="30mm" height="20mm" routingDisabled schMaxTraceDistance={100}>
      <net name="SHARED" />
      <resistor name="R1" resistance="1k" footprint="0603" schX={-3} />
      <resistor name="R2" resistance="1k" footprint="0603" schX={3} />
      <trace from=".R1 > .pin2" to="net.SHARED" />
      <trace from=".R1 > .pin2" to=".R2 > .pin1" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const namedNet = circuitJson
    .filter((row) => row.type === "source_net")
    .find((net) => net.name === "SHARED")!
  expect(namedNet).toBeDefined()
  const traces = circuitJson.filter((row) => row.type === "source_trace")
  expect(traces).toHaveLength(2)
  const named = traces.find(
    (trace) =>
      trace.connected_source_port_ids.length === 1 &&
      trace.connected_source_net_ids.includes(namedNet.source_net_id),
  )!
  expect(named).toBeDefined()
  const branch = traces.find((trace) => trace !== named)!
  expect(named.subcircuit_connectivity_map_key).toBeTruthy()
  expect(branch.connected_source_port_ids).toHaveLength(2)
  expect(
    branch.connected_source_port_ids.filter((id) =>
      named.connected_source_port_ids.includes(id),
    ),
  ).toHaveLength(1)
  // The fixture must name this connection natively before metadata is removed.
  const original = await getNativeNetParity(circuitJson)
  expect(original.conflicts).toEqual([])
  const originalNet = original.nets.find((net) => net.pins.includes("R1.2"))!
  expect(originalNet.pins).toEqual(["R1.2", "R2.1"])
  expect(originalNet.name).toContain("SHARED")
  // An imported branch can express its connection only through source ports.
  // The other trace still supplies the named-net association and original key.
  branch.connected_source_net_ids = []
  for (const element of circuitJson) {
    if (element === named || element === namedNet) continue
    if ("subcircuit_connectivity_map_key" in element)
      delete element.subcircuit_connectivity_map_key
  }
  expect(branch.subcircuit_connectivity_map_key).toBeUndefined()
  expect(named.connected_source_net_ids).toContain(namedNet.source_net_id)
  expectValidSourceRows(circuitJson)

  const { conflicts, nets } = await getNativeNetParity(circuitJson)
  expect(conflicts).toEqual([])
  expect(nets.find((net) => net.name === originalNet.name)?.pins).toEqual([
    "R1.2",
    "R2.1",
  ])
  const { pads } = readPcb(circuitJson)
  expect(pads.get("R1.2")?.name).toBe(originalNet.name)
  expect(pads.get("R2.1")?.name).toBe(originalNet.name)
  expect(pads.get("R1.2")?.id).toBeGreaterThan(0)
  expect(pads.get("R2.1")?.id).toBe(pads.get("R1.2")?.id)
}, 30_000)
