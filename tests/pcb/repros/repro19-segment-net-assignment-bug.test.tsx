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
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

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

  // Find the pcb_trace and modify it to replicate the target input scenario
  const pcbTrace = circuitJson.find((el) => el.type === "pcb_trace")
  expect(pcbTrace).toBeDefined()

  /**
   * Note: The standard tscircuit React renderer generates Circuit JSON where
   * `pcb_trace` elements have a `connection_name` and a `source_trace_id` pointing
   * to a `source_trace`.
   *
   * However, in some contexts (e.g. autorouter outputs from `capacity-autorouter`),
   * `pcb_trace` elements have a `source_trace_id` pointing directly to a `source_net` ID
   * and omit `connection_name`.
   *
   * We modify the rendered output here to match this specific input variant so that we
   * can test the converter's handling of it.
   */
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
    // Currently, without the fix, the segment gets assigned to net 0 (Default)
    // because AddTracesStage fails to resolve the net when source_trace_id is a
    // source_net ID and connection_name is absent.
    // We expect "0" here to document the behavior before the fix is applied.
    expect(firstMatch[1]).toBe("0")
  }

  // Generate and compare snapshot for visual confirmation
  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "pcb",
  })

  expect(
    await stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({
        circuitJson: circuitJson,
        outputType: "pcb",
      }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
