import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("via deduplication preserves different nets at the same position", () => {
  const circuitJson = [
    ...["A", "B", "C"].map((name) => ({
      type: "source_net",
      source_net_id: `source_net_${name}`,
      name,
      subcircuit_connectivity_map_key: name,
    })),
    {
      type: "pcb_via",
      pcb_via_id: "pcb_via_0",
      x: 0,
      y: 0,
      layers: ["top", "bottom"],
      outer_diameter: 0.6,
      hole_diameter: 0.3,
      subcircuit_connectivity_map_key: "A",
    },
    // The unresolved key "2" must not collide with KiCad net ID 2 (net B).
    ...["A", "B", "C", "C", "2"].map((net, index) => ({
      type: "pcb_trace",
      pcb_trace_id: `pcb_trace_${index}`,
      subcircuit_connectivity_map_key: net,
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
    })),
  ] as CircuitJson

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const pcb = parseKicadPcb(converter.getOutputString())

  expect(
    pcb.vias.map((via) => pcb.nets.find((net) => net.id === via.net?.id)?.name),
  ).toEqual(["A", "B", "C", ""])
})
