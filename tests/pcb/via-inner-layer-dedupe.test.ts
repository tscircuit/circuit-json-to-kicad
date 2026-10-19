import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadPcbConverter } from "../../lib/pcb/CircuitJsonToKicadPcbConverter"

test("deduplicates inner-layer trace route vias already covered by a physical pcb_via (#676)", () => {
  const circuitJson: CircuitJson = [
    {
      type: "pcb_board",
      pcb_board_id: "pcb_board_0",
      center: { x: 0, y: 0 },
      width: 24,
      height: 16,
      thickness: 1.4,
      num_layers: 4,
      material: "fr4",
    } as any,
    {
      type: "source_net",
      source_net_id: "source_net_0",
      name: "GND",
      member_source_group_ids: [],
      subcircuit_connectivity_map_key: "net_gnd",
    } as any,
    {
      type: "pcb_via",
      pcb_via_id: "pcb_via_0",
      x: -5.047,
      y: -1.3,
      outer_diameter: 0.3,
      hole_diameter: 0.2,
      layers: ["top", "inner1", "inner2", "bottom"],
      from_layer: "top",
      to_layer: "inner1",
      pcb_trace_id: "pcb_trace_0",
      subcircuit_connectivity_map_key: "net_gnd",
    } as any,
    {
      type: "pcb_via",
      pcb_via_id: "pcb_via_1",
      x: 5.4,
      y: 3.154,
      outer_diameter: 0.3,
      hole_diameter: 0.2,
      layers: ["top", "inner1", "inner2", "bottom"],
      from_layer: "top",
      to_layer: "bottom",
      pcb_trace_id: "pcb_trace_1",
      subcircuit_connectivity_map_key: "net_a",
    } as any,
    {
      type: "pcb_trace",
      pcb_trace_id: "pcb_trace_0",
      subcircuit_connectivity_map_key: "net_gnd",
      route: [
        {
          route_type: "wire",
          x: -5.047,
          y: 0,
          width: 0.15,
          layer: "top",
        },
        {
          route_type: "via",
          x: -5.047,
          y: -1.3,
          from_layer: "top",
          to_layer: "inner1",
          via_diameter: 0.3,
          via_hole_diameter: 0.2,
        },
        {
          route_type: "wire",
          x: -5.047,
          y: -1.3,
          width: 0.15,
          layer: "inner1",
        },
      ],
    } as any,
    {
      type: "pcb_trace",
      pcb_trace_id: "pcb_trace_1",
      subcircuit_connectivity_map_key: "net_a",
      route: [
        {
          route_type: "via",
          x: 5.4,
          y: 3.154,
          from_layer: "top",
          to_layer: "bottom",
          via_diameter: 0.3,
          via_hole_diameter: 0.2,
        },
      ],
    } as any,
  ]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const pcb = converter.getOutput()

  expect(pcb.vias).toHaveLength(2)
  expect(
    new Set(pcb.vias.map((via) => `${via.at?.x}:${via.at?.y}`)).size,
  ).toBe(2)
})
