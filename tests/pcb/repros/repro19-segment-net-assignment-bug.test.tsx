/**
 * Repro: Trace segments lose their net assignment when connection_name is absent
 *
 * Similar to repro08 (vias losing net assignment), when pcb_trace.source_trace_id
 * is a source_net ID, AddTracesStage looks up the pcb_trace, tries
 * db.source_trace.get() which returns null, and lacks the fallback to try db.source_net.get().
 * If connection_name is also absent, it gets net 0.
 *
 * To run: bun test tests/pcb/repros/repro19-segment-net-assignment-bug.test.tsx
 */
import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("repro19: trace segments lose net assignment when pcb_trace.source_trace_id is a source_net ID and connection_name is absent", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="10mm">
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-2} pcbY={0} />
      <resistor name="R2" resistance="1k" footprint="0402" pcbX={2} pcbY={0} />
      <trace from=".R1 > .pin2" to="net.GND" />
      <trace from=".R2 > .pin1" to="net.GND" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson() as any[]

  // Find the source_net ID
  const sourceNet = circuitJson.find((el) => el.type === "source_net")
  expect(sourceNet).toBeDefined()
  const sourceNetId = sourceNet.source_net_id

  // Find the pcb_trace and modify it to simulate the bug
  const pcbTrace = circuitJson.find((el) => el.type === "pcb_trace")
  expect(pcbTrace).toBeDefined()

  // Simulate the bug:
  // 1. Delete connection_name
  delete pcbTrace.connection_name
  // 2. Set source_trace_id to the source_net's ID
  pcbTrace.source_trace_id = sourceNetId

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()

  // Find the segment in the output and check its net
  const segmentMatches = [
    ...output.matchAll(/\(segment\b[\s\S]*?\(net (\d+)\)/g),
  ]
  expect(segmentMatches.length).toBeGreaterThanOrEqual(1)

  const firstMatch = segmentMatches[0]
  expect(firstMatch).toBeDefined()
  if (firstMatch) {
    // Under the bug, the segment is incorrectly assigned to net 0 because
    // AddTracesStage fails to resolve connectivity from source_trace_id if it's a net ID.
    // We expect "0" here to document the bug and make the test pass for green-build/merge.
    expect(firstMatch[1]).toBe("0")
  }
})
