import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import nema23ViaFixture from "../assets/nema23-via-position-roundoff.circuit.json"

const exportVias = (circuitJson: CircuitJson) => {
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  return parseKicadPcb(converter.getOutputString()).vias
}

// Reduced from imrishabh18/nema-23-stepper-controller v1.3.4, omitting the board
// outline. Two routes reference pcb_via_145 with y differing by one ULP.
test("deduplicates the NEMA23 route via without changing its physical geometry", () => {
  const vias = exportVias(nema23ViaFixture as CircuitJson)

  expect(vias).toHaveLength(2)
  expect(vias.map((via) => via.getString()).join("\n\n")).toMatchSnapshot()
})

const createCircuitJson = (
  routeOverrides: Record<string, unknown> = {},
  physicalOverrides: Record<string, unknown> = {},
  traceOverrides: Record<string, unknown> = {},
): CircuitJson =>
  [
    {
      type: "pcb_board",
      pcb_board_id: "pcb_board_0",
      center: { x: 0, y: 0 },
      width: 10,
      height: 10,
      num_layers: 4,
      thickness: 1.6,
      material: "fr4",
    },
    ...["A", "B"].map((name) => ({
      type: "source_net",
      source_net_id: `source_net_${name}`,
      subcircuit_connectivity_map_key: name,
      name,
    })),
    {
      type: "pcb_via",
      pcb_via_id: "pcb_via_0",
      x: 0,
      y: 0,
      layers: ["top", "inner1", "inner2", "bottom"],
      outer_diameter: 0.6,
      hole_diameter: 0.3,
      subcircuit_connectivity_map_key: "A",
      ...physicalOverrides,
    },
    {
      type: "pcb_trace",
      pcb_trace_id: "pcb_trace_0",
      subcircuit_connectivity_map_key: "A",
      ...traceOverrides,
      route: [
        {
          route_type: "via",
          x: 0,
          y: 0,
          from_layer: "top",
          to_layer: "bottom",
          via_diameter: 0.6,
          via_hole_diameter: 0.3,
          ...routeOverrides,
        },
      ],
    },
  ] as CircuitJson

test.each([
  ["positive cell boundary", 0.9999999999e-6, 1.0000000001e-6],
  ["negative cell boundary", -0.9999999999e-6, -1.0000000001e-6],
  ["zero cell boundary", -1e-10, 1e-10],
])("deduplicates nearby vias across a %s", (_, physical, route) => {
  const vias = exportVias(
    createCircuitJson({ x: route, y: route }, { x: physical, y: physical }),
  )

  expect(vias).toHaveLength(1)
})

test.each([
  ["x", { x: 1.5e-6 }],
  ["y", { y: 1.5e-6 }],
])(
  "preserves vias separated beyond the position tolerance on %s",
  (_, route) => {
    expect(exportVias(createCircuitJson(route))).toHaveLength(2)
  },
)

test("nearby vias on distinct nets remain separate", () => {
  const vias = exportVias(
    createCircuitJson(
      { y: 1e-10 },
      {},
      { subcircuit_connectivity_map_key: "B" },
    ),
  )

  expect(vias.map((via) => via.net?.id)).toEqual([1, 2])
})

test.each([
  ["outer diameter", { via_diameter: 0.8 }],
  ["hole diameter", { via_hole_diameter: 0.4 }],
])("nearby vias with a different %s remain separate", (_, dimensions) => {
  expect(
    exportVias(createCircuitJson({ y: 1e-10, ...dimensions })),
  ).toHaveLength(2)
})

test("nearby route vias outside the physical layer span remain separate", () => {
  const vias = exportVias(
    createCircuitJson(
      { y: 1e-10, from_layer: "inner1", to_layer: "bottom" },
      { layers: ["top", "inner1"] },
    ),
  )

  expect(vias).toHaveLength(2)
})
