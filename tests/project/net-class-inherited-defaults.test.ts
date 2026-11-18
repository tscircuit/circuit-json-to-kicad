import { expect, test } from "bun:test"
import "bun-match-svg"
import type { CircuitJson } from "circuit-json"
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadProConverter,
} from "lib"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"

const circuitJson: CircuitJson = [
  {
    type: "pcb_board",
    pcb_board_id: "a",
    subcircuit_id: "sa",
    center: { x: 0, y: 0 },
    width: 10,
    height: 10,
    num_layers: 2,
    thickness: 1.6,
    material: "fr4",
    default_nominal_trace_width: 0.2,
  },
  {
    type: "pcb_board",
    pcb_board_id: "b",
    subcircuit_id: "sb",
    center: { x: 20, y: 0 },
    width: 10,
    height: 10,
    num_layers: 2,
    thickness: 1.6,
    material: "fr4",
    default_nominal_trace_width: 0.5,
  },
  {
    type: "source_net_class",
    source_net_class_id: "inherited",
    name: "Inherited",
  },
  {
    type: "source_net",
    source_net_id: "va",
    name: "VCC",
    subcircuit_id: "sa",
    member_source_group_ids: [],
    source_net_class_ids: ["inherited"],
  },
  {
    type: "source_net",
    source_net_id: "vb",
    name: "VCC",
    subcircuit_id: "sb",
    member_source_group_ids: [],
    source_net_class_ids: ["inherited"],
  },
]

function settings(data: CircuitJson = circuitJson) {
  return JSON.parse(new CircuitJsonToKicadProConverter(data).getOutputString())
    .net_settings as {
    classes: { name: string; track_width?: number; priority?: number }[]
    netclass_assignments?: Record<string, string[]>
  }
}

test("snapshot class assignments for nets inheriting different board defaults", async () => {
  const exported = settings()
  const definitions = exported.classes
    .map((netClass) => `${netClass.name}: ${netClass.track_width ?? "inherit"}`)
    .join("; ")
  const rows = Object.entries(exported.netclass_assignments ?? {}).map(
    ([net, classes], index) =>
      `<text x="20" y="${100 + index * 30}">${net}: ${classes.join(" + ")}</text>`,
  )
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="200"><rect width="100%" height="100%" fill="white"/><g font-family="monospace" font-size="16" fill="#111"><text x="20" y="30">Board A default: 0.2 mm; Board B default: 0.5 mm</text><text x="20" y="60">${definitions}</text>${rows.join("")}</g></svg>`
  await expect(svg).toMatchSvgSnapshot(import.meta.path, "inherited-defaults")
})

test("a net with an unset class width inherits its own board default", () => {
  const exported = settings()
  expect(exported.netclass_assignments?.["b/VCC"]).toEqual([
    "Trace Width 0.5 mm",
    "Inherited",
  ])
  expect(
    exported.classes.find((netClass) => netClass.name === "Trace Width 0.5 mm")
      ?.track_width,
  ).toBe(0.5)
})

test("inherited board widths survive serialized PCB/project export and re-import", () => {
  const withCopper: CircuitJson = [
    ...circuitJson,
    {
      type: "source_trace",
      source_trace_id: "ta",
      subcircuit_id: "sa",
      subcircuit_connectivity_map_key: "va",
      connected_source_port_ids: [],
      connected_source_net_ids: ["va"],
    },
    {
      type: "source_trace",
      source_trace_id: "tb",
      subcircuit_id: "sb",
      subcircuit_connectivity_map_key: "vb",
      connected_source_port_ids: [],
      connected_source_net_ids: ["vb"],
    },
    {
      type: "pcb_trace",
      pcb_trace_id: "pa",
      source_trace_id: "ta",
      subcircuit_id: "sa",
      route: [
        { route_type: "wire", x: -2, y: 0, layer: "top", width: 0.1 },
        { route_type: "wire", x: 2, y: 0, layer: "top", width: 0.1 },
      ],
    },
    {
      type: "pcb_trace",
      pcb_trace_id: "pb",
      source_trace_id: "tb",
      subcircuit_id: "sb",
      route: [
        { route_type: "wire", x: 18, y: 0, layer: "top", width: 0.1 },
        { route_type: "wire", x: 22, y: 0, layer: "top", width: 0.1 },
      ],
    },
  ]
  const pcb = new CircuitJsonToKicadPcbConverter(withCopper)
  pcb.runUntilFinished()
  const project = new CircuitJsonToKicadProConverter(withCopper)
  const importer = new KicadToCircuitJsonConverter()
  importer.addFile("boards.kicad_pcb", pcb.getOutputString())
  importer.addFile("boards.kicad_pro", project.getOutputString())
  importer.runUntilFinished()
  expect(
    importer
      .getOutput()
      .filter((element) => element.type === "source_net")
      .map((net) => ({ name: net.name, width: net.trace_width }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  ).toEqual([
    { name: "a_VCC", width: 0.2 },
    { name: "b_VCC", width: 0.5 },
  ])
})

test("a scoped Default class does not change the width of nets outside its scope", () => {
  const data: CircuitJson = [
    {
      type: "pcb_board",
      pcb_board_id: "board",
      subcircuit_id: "board",
      center: { x: 0, y: 0 },
      num_layers: 2,
      thickness: 1.6,
      material: "fr4",
      default_nominal_trace_width: 0.1,
    },
    {
      type: "source_net_class",
      source_net_class_id: "default",
      name: "Default",
      trace_width: 0.8,
      subcircuit_id: "left",
    },
    {
      type: "source_net",
      source_net_id: "power",
      name: "VCC",
      subcircuit_id: "left",
      member_source_group_ids: [],
      source_net_class_ids: ["default"],
    },
    {
      type: "source_net",
      source_net_id: "control",
      name: "CONTROL",
      subcircuit_id: "right",
      member_source_group_ids: [],
    },
  ]
  const exported = settings(data)
  expect(exported.netclass_assignments?.CONTROL).toEqual(["Trace Width 0.1 mm"])
})

test("an explicit Default assignment and its implicit fallback are equivalent", () => {
  const data: CircuitJson = [
    {
      type: "source_net_class",
      source_net_class_id: "default",
      name: "Default",
      trace_width: 0.2,
    },
    {
      type: "source_net",
      source_net_id: "first",
      name: "VCC",
      member_source_group_ids: [],
      source_net_class_ids: ["default"],
    },
    {
      type: "source_net",
      source_net_id: "second",
      name: "VCC",
      member_source_group_ids: [],
    },
  ]
  expect(() => new CircuitJsonToKicadProConverter(data)).not.toThrow()
})

test("a width override keeps an authored priority at KiCad's maximum in range", () => {
  const data: CircuitJson = [
    {
      type: "source_net_class",
      source_net_class_id: "power",
      name: "Power",
      trace_width: 0.8,
      priority: 2147483647,
    },
    {
      type: "source_net",
      source_net_id: "power_net",
      name: "VCC",
      member_source_group_ids: [],
      source_net_class_ids: ["power"],
      trace_width: 0.3,
    },
  ]
  const exported = new CircuitJsonToKicadProConverter(data).getOutput()
    .net_settings
  expect(
    exported.classes.find((netClass) => netClass.name === "Power")?.priority,
  ).toBe(2147483647)
})
