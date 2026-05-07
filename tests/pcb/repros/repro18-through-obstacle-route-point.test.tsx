import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

const circuitJson: CircuitJson = [
  {
    type: "source_net",
    source_net_id: "source_net_1",
    name: "N1",
    subcircuit_connectivity_map_key: "net1",
  },
  {
    type: "source_trace",
    source_trace_id: "source_trace_1",
    connected_source_net_ids: ["source_net_1"],
    subcircuit_connectivity_map_key: "net1",
  },
  {
    type: "pcb_trace",
    pcb_trace_id: "pcb_trace_1",
    source_trace_id: "source_trace_1",
    route: [
      { route_type: "wire", x: 0, y: 0, width: 0.15, layer: "top" },
      {
        route_type: "through_obstacle",
        start: { x: 0, y: 0 },
        end: { x: 0, y: 0 },
        from_layer: "top",
        to_layer: "inner1",
        width: 0.15,
      },
      { route_type: "wire", x: 1, y: 0, width: 0.15, layer: "inner1" },
    ],
  },
] as any

test("repro18: through_obstacle route points do not emit NaN segments", () => {
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()

  expect(output).not.toContain("NaN")
  expect(output).toContain("(end 101 100)")
})
