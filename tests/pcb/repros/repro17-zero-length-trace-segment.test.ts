import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("duplicate adjacent trace points should not create a zero-length segment", () => {
  const circuitJson = [
    {
      type: "pcb_board",
      pcb_board_id: "pcb_board_0",
      source_board_id: "source_board_0",
      center: { x: 0, y: 0 },
      thickness: 1.6,
      num_layers: 2,
      width: 20,
      height: 10,
      material: "fr4",
    },
    {
      type: "source_net",
      source_net_id: "source_net_1",
      name: "GND",
      subcircuit_connectivity_map_key: "net.GND",
    },
    {
      type: "pcb_trace",
      pcb_trace_id: "pcb_trace_1",
      connection_name: "source_net_1",
      subcircuit_connectivity_map_key: "net.GND",
      route: [
        { route_type: "wire", x: 0, y: 0, width: 0.15, layer: "top" },
        { route_type: "wire", x: 0, y: 0, width: 0.15, layer: "top" },
        { route_type: "wire", x: 2, y: 0, width: 0.15, layer: "top" },
      ],
    },
  ] as any

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const output = converter.getOutputString()
  const segments = output.match(/\(segment[\s\S]*?\(uuid [^)]+\)\n  \)/g) || []

  expect(segments.length).toBe(1)
  expect(output).not.toContain("(start 100 100)\n    (end 100 100)")
  expect(output).toContain("(start 100 100)\n    (end 102 100)")
})
