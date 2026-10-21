import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("via deduplication preserves different dimensions at the same position", () => {
  const circuitJson = [
    {
      type: "pcb_via",
      pcb_via_id: "pcb_via_0",
      pcb_trace_id: "pcb_trace_0",
      x: 0,
      y: 0,
      layers: ["top", "bottom"],
      outer_diameter: 0.6,
      hole_diameter: 0.3,
    },
    {
      type: "pcb_trace",
      pcb_trace_id: "pcb_trace_0",
      route: [
        [0.6, 0.3],
        [0.8, 0.4],
        [0.8, 0.4],
      ].map(([size, drill]) => ({
        route_type: "via",
        x: 0,
        y: 0,
        from_layer: "top",
        to_layer: "bottom",
        via_diameter: size,
        via_hole_diameter: drill,
      })),
    },
  ] as CircuitJson

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const vias = parseKicadPcb(converter.getOutputString()).vias

  expect(vias.map((via) => [via.size, via.drill])).toEqual([
    [0.6, 0.3],
    [0.8, 0.4],
  ])
})
