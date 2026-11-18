import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadProConverter } from "lib"

test("export diagnoses missing classes, conflicting definitions and conflicting memberships", () => {
  const net: CircuitJson[number] = {
    type: "source_net",
    source_net_id: "vcc",
    name: "VCC",
    member_source_group_ids: [],
    source_net_class_ids: ["power"],
  }
  const power: CircuitJson[number] = {
    type: "source_net_class",
    source_net_class_id: "power",
    name: "Power",
    trace_width: 0.8,
  }
  expect(() => new CircuitJsonToKicadProConverter([net])).toThrow(
    "without class definitions",
  )
  expect(
    () =>
      new CircuitJsonToKicadProConverter([
        power,
        { ...net, source_net_class_ids: ["missing"] },
      ]),
  ).toThrow('Net "VCC" refers to a missing net class')
  expect(
    () =>
      new CircuitJsonToKicadProConverter([
        power,
        { ...power, source_net_class_id: "second", trace_width: 0.2 },
      ]),
  ).toThrow('conflicting definitions for KiCad net class "Power"')
  expect(
    () =>
      new CircuitJsonToKicadProConverter([
        power,
        net,
        { ...net, source_net_id: "vcc2", source_net_class_ids: [] },
      ]),
  ).toThrow('conflicting net class assignments for KiCad net "VCC"')
})

test("explicit widths retain named memberships and win via a generated class", () => {
  const circuitJson: CircuitJson = [
    {
      type: "source_net_class",
      source_net_class_id: "power",
      name: "Power",
      trace_width: 0.8,
      priority: 0,
    },
    {
      type: "source_net_class",
      source_net_class_id: "occupied",
      name: "Trace Width 0.3 mm",
      trace_width: 0.5,
      priority: 3,
    },
    {
      type: "source_net",
      source_net_id: "vcc",
      name: "VCC",
      member_source_group_ids: [],
      trace_width: 0.3,
      source_net_class_ids: ["power"],
    },
  ]
  const settings = new CircuitJsonToKicadProConverter(circuitJson).getOutput()
    .net_settings
  expect(settings.netclass_assignments?.VCC).toEqual([
    "Trace Width 0.3 mm (2)",
    "Power",
  ])
  expect(
    settings.classes.find(
      (netClass) => netClass.name === "Trace Width 0.3 mm (2)",
    ),
  ).toMatchObject({ track_width: 0.3, priority: 0 })
  expect(
    settings.classes.find((netClass) => netClass.name === "Power"),
  ).toMatchObject({ track_width: 0.8, priority: 1 })
  expect(circuitJson[0]).toMatchObject({ priority: 0 })
})

test("exact assignments preserve net names with KiCad pattern metacharacters", () => {
  const circuitJson: CircuitJson = [
    {
      type: "source_net_class",
      source_net_class_id: "sense",
      name: "Sense",
      trace_width: 0.2,
    },
    {
      type: "source_net",
      source_net_id: "sense_net",
      name: "SENSE[0]",
      member_source_group_ids: [],
      source_net_class_ids: ["sense"],
    },
  ]
  const settings = new CircuitJsonToKicadProConverter(circuitJson).getOutput()
    .net_settings
  expect(settings.netclass_assignments).toEqual({ "SENSE[0]": ["Sense"] })
  expect(settings.netclass_patterns).toEqual([])
})
