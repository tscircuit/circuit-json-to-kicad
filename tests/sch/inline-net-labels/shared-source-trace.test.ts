import { expect, test } from "bun:test"
import { exportNativeSchematicNets } from "../../fixtures/export-native-schematic-nets"
import { createInlineLabelCircuit } from "../../fixtures/inline-net-labels"

test("labels stay on their own wire stubs when both refer to one source trace", async () => {
  const circuit = createInlineLabelCircuit().filter(
    (row) =>
      row.type !== "source_trace" || row.source_trace_id !== "source_trace_1",
  )
  for (const row of circuit) {
    if (row.type === "source_trace") {
      row.connected_source_port_ids = ["source_port_1", "source_port_2"]
    }
    // Move R2 above R1, with its short stub pointing left. R1's longer stub
    // points right: its own open end is farther away than R2's open end.
    if (
      row.type === "schematic_component" &&
      row.source_component_id === "source_component_1"
    ) {
      row.center = { x: 0, y: 1 }
    }
    if (
      row.type === "schematic_port" &&
      row.schematic_component_id === "schematic_component_1"
    ) {
      row.center = { x: row.center.x - 5, y: 1 }
    }
    if (row.type === "schematic_trace") {
      row.edges =
        row.source_trace_id === "source_trace_0"
          ? [{ from: { x: 0.3, y: 0 }, to: { x: 3, y: 0 } }]
          : [{ from: { x: -0.3, y: 1 }, to: { x: -1.06, y: 1 } }]
      row.source_trace_id = "source_trace_0"
    }
    if (row.type === "schematic_text") {
      if (row.source_trace_id === "source_trace_1") {
        row.position = { x: -0.4, y: 1.06 }
      }
      row.source_trace_id = "source_trace_0"
    }
  }

  const nets = await exportNativeSchematicNets(circuit)
  expect(nets.filter((net) => net.name?.endsWith("SIGNAL"))).toEqual([
    { name: "/SIGNAL", pins: ["R1.2", "R2.1"] },
  ])
}, 30_000)
