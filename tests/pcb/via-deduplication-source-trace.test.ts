import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("via deduplication resolves a shared source trace through the connectivity map", () => {
  const circuitJson = [
    { type: "source_net", source_net_id: "source_net_0", name: "GND" },
    {
      type: "source_trace",
      source_trace_id: "source_trace_0",
      connected_source_port_ids: [],
      connected_source_net_ids: ["source_net_0"],
    },
    {
      type: "pcb_via",
      pcb_via_id: "pcb_via_0",
      source_trace_id: "source_trace_0",
      x: 0,
      y: 0,
      layers: ["top", "bottom"],
      outer_diameter: 0.6,
      hole_diameter: 0.3,
    },
    {
      type: "pcb_trace",
      pcb_trace_id: "pcb_trace_0",
      source_trace_id: "source_trace_0",
      route: [
        {
          route_type: "via",
          x: 0,
          y: 0,
          from_layer: "top",
          to_layer: "bottom",
          via_diameter: 0.6,
          via_hole_diameter: 0.3,
        },
      ],
    },
  ] as CircuitJson
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const pcb = converter.getOutput()

  expect(pcb.vias).toHaveLength(1)
  expect(pcb.nets.find((net) => net.id === pcb.vias[0]!.net?.id)?.name).toBe(
    "GND",
  )
})
