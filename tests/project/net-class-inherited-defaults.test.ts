import { expect, test } from "bun:test"
import "bun-match-svg"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadProConverter } from "lib"

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

function settings() {
  return JSON.parse(
    new CircuitJsonToKicadProConverter(circuitJson).getOutputString(),
  ).net_settings as ReturnType<
    CircuitJsonToKicadProConverter["getOutput"]
  >["net_settings"]
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

test.failing("a net with an unset class width inherits its own board default", () => {
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

test.failing("a scoped Default class does not change the width of nets outside its scope", () => {
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
  const exported = new CircuitJsonToKicadProConverter(data).getOutput()
    .net_settings
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

test.failing("a width override keeps an authored priority at KiCad's maximum in range", () => {
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
