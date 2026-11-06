import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("route via deduplication uses the exported default dimensions", () => {
  const circuitJson = [
    {
      type: "pcb_trace",
      pcb_trace_id: "pcb_trace_0",
      route: [{}, { outer_diameter: 0.8, hole_diameter: 0.4 }].map(
        (dimensions) => ({
          route_type: "via",
          x: 0,
          y: 0,
          from_layer: "top",
          to_layer: "bottom",
          ...dimensions,
        }),
      ),
    },
  ] as CircuitJson

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  expect(
    converter.getOutput().vias.map((via) => [via.size, via.drill]),
  ).toEqual([[0.8, 0.4]])
})
