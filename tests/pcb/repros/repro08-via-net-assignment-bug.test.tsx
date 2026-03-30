/**
 * Bug 1 (Critical): Vias lose their net assignment
 *
 * The capacity-autorouter sets pcb_trace.source_trace_id to a source_net ID
 * (e.g. "source_net_1"). AddViasStage looks up the pcb_trace, then tries
 * db.source_trace.get("source_net_1") which returns null — it has no fallback
 * to try db.source_net.get("source_net_1"). Result: via gets net 0.
 *
 * To run: bun test tests/pcb/repros/repro08-via-net-assignment-bug.test.tsx
 */
import { test, expect } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import circuitJson from "tests/assets/555-timer-circuit.json"

test("repro08: vias lose net assignment when pcb_trace.source_trace_id is a source_net ID", () => {
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson as any)
  converter.runUntilFinished()
  const output = converter.getOutputString()

  Bun.write("./debug-output/repro08-via-net-assignment-bug.kicad_pcb", output)

  const viaNetMatches = [...output.matchAll(/\(via\b[\s\S]*?\(net (\d+)\)/g)]
  const viaNet0Count = viaNetMatches.filter((m) => m[1] === "0").length

  // BUG: AddViasStage tries db.source_trace.get("source_net_1") → null, no fallback
  // All vias should have a real net, not net 0
  expect(viaNet0Count).toBe(0)
})
