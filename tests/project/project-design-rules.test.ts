import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadProConverter } from "lib/project/CircuitJsonToKicadProConverter"
import repro09CircuitJson from "tests/assets/repro09-555-timer-circuit-small-vias.json"

test("project export derives board rules from explicit standalone vias", () => {
  const converter = new CircuitJsonToKicadProConverter(
    repro09CircuitJson as CircuitJson,
    {
      projectName: "repro09",
    },
  )
  converter.runUntilFinished()

  const project = JSON.parse(converter.getOutputString())

  expect(project.board.design_settings.rules.min_track_width).toBe(0.15)
  expect(project.board.design_settings.rules.min_via_diameter).toBe(0.3)
  expect(project.board.design_settings.rules.min_through_hole_diameter).toBe(
    0.2,
  )
  expect(project.board.design_settings.rules.min_via_annular_width).toBe(0.05)
  expect(project.net_settings.classes[0].track_width).toBe(0.15)
  expect(project.net_settings.classes[0].via_diameter).toBe(0.3)
  expect(project.net_settings.classes[0].via_drill).toBe(0.2)
  expect(project.board.design_settings.track_widths).toEqual([0.15])
  expect(project.board.design_settings.via_dimensions).toEqual([
    { diameter: 0.3, drill: 0.2 },
  ])
})

test("project export includes route-defined via sizes in defaults and rules", () => {
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

  const converter = new CircuitJsonToKicadProConverter(circuitJson, {
    projectName: "repro11-project",
  })
  converter.runUntilFinished()

  const project = JSON.parse(converter.getOutputString())

  expect(project.board.design_settings.rules.min_via_diameter).toBe(1.1)
  expect(project.board.design_settings.rules.min_through_hole_diameter).toBe(
    0.55,
  )
  expect(project.net_settings.classes[0].via_diameter).toBe(1.1)
  expect(project.net_settings.classes[0].via_drill).toBe(0.55)
  expect(project.board.design_settings.via_dimensions).toEqual([
    { diameter: 1.1, drill: 0.55 },
  ])
})
