/**
 * Bug 4 (Moderate): Route-defined vias are not emitted, so their sizes are lost
 *
 * Circuit JSON allows vias to be embedded directly inside `pcb_trace.route`
 * entries with `route_type: "via"`. AddViasStage only reads standalone
 * `pcb_via` objects, so route-defined vias never become KiCad vias and their
 * outer/hole diameters are not copied through.
 *
 * To run: bun test tests/pcb/repros/repro11-route-via-size-copy.test.tsx
 */
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
        route_type: "via",
        x: 1,
        y: 0,
        from_layer: "top",
        to_layer: "bottom",
        outer_diameter: 1.1,
        hole_diameter: 0.55,
      },
      { route_type: "wire", x: 1, y: 0, width: 0.15, layer: "bottom" },
      { route_type: "wire", x: 2, y: 0, width: 0.15, layer: "bottom" },
    ],
  },
] as any

test("repro11: route-defined via copies size and drill into KiCad output", () => {
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()

  Bun.write("./debug-output/repro11-route-via-size-copy.kicad_pcb", output)

  const viaMatches = [
    ...output.matchAll(
      /\(via\b[\s\S]*?\(size ([\d.]+)\)[\s\S]*?\(drill ([\d.]+)\)[\s\S]*?\(layers ([^)]+)\)/g,
    ),
  ]

  expect(viaMatches).toHaveLength(1)
  expect(Number(viaMatches[0]![1])).toBe(1.1)
  expect(Number(viaMatches[0]![2])).toBe(0.55)
  expect(viaMatches[0]![3]).toContain("F.Cu")
  expect(viaMatches[0]![3]).toContain("B.Cu")
})
