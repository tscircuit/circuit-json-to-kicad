import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("preserves through, blind and buried via types for standalone and route vias", () => {
  const spans = [
    ["top", "bottom"],
    ["top", "inner1"],
    ["inner2", "top"],
    ["bottom", "inner2"],
    ["inner1", "inner2"],
  ] as const
  const circuitJson = [
    {
      type: "pcb_board",
      pcb_board_id: "b",
      center: { x: 0, y: 0 },
      width: 20,
      height: 20,
      num_layers: 4,
      thickness: 1.6,
    },
    ...spans.map(([from, to], i) => ({
      type: "pcb_via",
      pcb_via_id: `v${i}`,
      x: i,
      y: 0,
      layers: [from, to],
      outer_diameter: 0.6,
      hole_diameter: 0.3,
    })),
    {
      type: "pcb_trace",
      pcb_trace_id: "route",
      route: spans.map(([from_layer, to_layer], i) => ({
        route_type: "via",
        x: i,
        y: 2,
        from_layer,
        to_layer,
        via_diameter: 0.6,
        via_hole_diameter: 0.3,
      })),
    },
  ] as CircuitJson
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  expect(output).not.toMatch(/\(type (?:blind|buried)\)/)
  expect(output.match(/\(via blind/g)).toHaveLength(6)
  expect(output.match(/\(via buried/g)).toHaveLength(2)
  const vias = parseKicadPcb(output).vias
  expect(vias).toHaveLength(10)
  expect(vias.map((v) => v.type)).toEqual([
    undefined,
    "blind",
    "blind",
    "blind",
    "buried",
    undefined,
    "blind",
    "blind",
    "blind",
    "buried",
  ])
  const expectedLayers = [
    ["F.Cu", "B.Cu"],
    ["F.Cu", "In1.Cu"],
    ["F.Cu", "In2.Cu"],
    ["In2.Cu", "B.Cu"],
    ["In1.Cu", "In2.Cu"],
  ]
  expect(vias.map((v) => v.layers?.names)).toEqual([
    ...expectedLayers,
    ...expectedLayers,
  ])
  expect(vias.map((v) => [v.size, v.drill])).toEqual(
    Array.from({ length: 10 }, () => [0.6, 0.3]),
  )
})

test("two-layer vias and vias with an unspecified span remain through vias", () => {
  const circuitJson = [
    {
      type: "pcb_board",
      pcb_board_id: "b",
      center: { x: 0, y: 0 },
      width: 20,
      height: 20,
      num_layers: 2,
      thickness: 1.6,
    },
    {
      type: "pcb_via",
      pcb_via_id: "through",
      x: 0,
      y: 0,
      layers: ["bottom", "top"],
      outer_diameter: 0.6,
      hole_diameter: 0.3,
    },
    {
      type: "pcb_trace",
      pcb_trace_id: "route",
      route: [{ route_type: "via", x: 2, y: 0 }],
    },
  ] as CircuitJson
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const vias = parseKicadPcb(converter.getOutputString()).vias
  expect(vias.map((v) => v.type)).toEqual([undefined, undefined])
  expect(vias.map((v) => v.layers?.names)).toEqual([
    ["F.Cu", "B.Cu"],
    ["F.Cu", "B.Cu"],
  ])
})
