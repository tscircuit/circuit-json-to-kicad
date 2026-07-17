import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("exports traces and vias on all 10 KiCad copper layers", () => {
  const circuitJson = [
    {
      type: "pcb_board",
      pcb_board_id: "pcb_board_0",
      center: { x: 0, y: 0 },
      width: 20,
      height: 20,
      num_layers: 10,
    },
    {
      type: "pcb_trace",
      pcb_trace_id: "pcb_trace_inner7_inner8",
      route: [
        {
          route_type: "wire",
          x: -5,
          y: 0,
          width: 0.2,
          layer: "inner7",
        },
        {
          route_type: "wire",
          x: 0,
          y: 0,
          width: 0.2,
          layer: "inner7",
        },
        {
          route_type: "via",
          x: 0,
          y: 0,
          from_layer: "inner7",
          to_layer: "inner8",
          via_diameter: 0.6,
          hole_diameter: 0.3,
        },
        {
          route_type: "wire",
          x: 0,
          y: 0,
          width: 0.2,
          layer: "inner8",
        },
        {
          route_type: "wire",
          x: 5,
          y: 0,
          width: 0.2,
          layer: "inner8",
        },
      ],
    },
  ] as CircuitJson

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()

  for (let index = 1; index <= 8; index++) {
    expect(output).toContain(`In${index}.Cu`)
  }
  expect(output).toMatch(/\(segment[\s\S]*?\(layer In7\.Cu\)/)
  expect(output).toMatch(/\(segment[\s\S]*?\(layer In8\.Cu\)/)
  expect(output).toMatch(/\(via[\s\S]*?\(layers In7\.Cu In8\.Cu\)/)
  expect(output).not.toContain("inner7")
  expect(output).not.toContain("inner8")
})
