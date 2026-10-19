import { expect, test } from "bun:test"
import { Circuit } from "tscircuit-latest"
import { exportNativeSchematicNets } from "../../fixtures/export-native-schematic-nets"

test("labels stay on their own wire stubs when both refer to one source trace", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm" routingDisabled schMaxTraceDistance={1}>
      <resistor name="R1" resistance="1k" footprint="0402" schX={-1.5} />
      <resistor name="R2" resistance="1k" footprint="0402" schX={1.5} />
      <trace from=".R1 > .pin2" to="net.SIGNAL" />
      <trace from=".R2 > .pin1" to="net.SIGNAL" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const sources = circuitJson.filter((row) => row.type === "source_trace")
  expect(sources).toHaveLength(2)
  const first = sources[0]!
  const second = sources[1]!
  const wire = circuitJson.find(
    (row) =>
      row.type === "schematic_trace" &&
      row.source_trace_id === first.source_trace_id,
  )
  if (wire?.type !== "schematic_trace") throw new Error("Missing first stub")
  // Extend the first stub upward and then right. Its own free end is farther
  // from its label than the second stub's free end, but its wire is nearer.
  const start = wire.edges[0]!.from
  const corner = { x: start.x, y: start.y + 2 }
  wire.edges = [
    { from: start, to: corner },
    { from: corner, to: { x: corner.x + 5, y: corner.y } },
  ]
  first.connected_source_port_ids.push(...second.connected_source_port_ids)
  for (const row of circuitJson) {
    if (row.type === "schematic_trace" || row.type === "schematic_text") {
      row.source_trace_id = first.source_trace_id
    }
  }

  const nets = await exportNativeSchematicNets(
    circuitJson.filter((row) => row !== second),
  )
  expect(nets.filter((net) => net.name?.endsWith("SIGNAL"))).toEqual([
    { name: "/SIGNAL", pins: ["R1.2", "R2.1"] },
  ])
}, 30_000)
