import { expect, test } from "bun:test"
import "bun-match-svg"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadProConverter } from "lib"

const circuitJson: CircuitJson = [
  {
    type: "source_net_class",
    source_net_class_id: "power",
    name: "Power",
    trace_width: 0.8,
    priority: 1,
  },
  {
    type: "source_net_class",
    source_net_class_id: "sense",
    name: "Sense",
    trace_width: 0.8,
    priority: 2,
  },
  {
    type: "source_net_class",
    source_net_class_id: "inherited",
    name: "Inherited",
    priority: 0,
  },
  {
    type: "source_net_class",
    source_net_class_id: "unused",
    name: "Unused",
    trace_width: 0.4,
    priority: 3,
  },
  {
    type: "source_net",
    source_net_id: "vcc",
    name: "VCC",
    member_source_group_ids: [],
    trace_width: 0.8,
    source_net_class_ids: ["inherited", "power"],
  },
  {
    type: "source_net",
    source_net_id: "sense_net",
    name: "SENSE",
    member_source_group_ids: [],
    trace_width: 0.8,
    source_net_class_ids: ["sense"],
  },
]

function exportedSettings() {
  return JSON.parse(
    new CircuitJsonToKicadProConverter(circuitJson).getOutputString(),
  ).net_settings
}

test("snapshot serialized KiCad classes and assignments", async () => {
  const settings = exportedSettings()
  const rows = settings.classes.map(
    (netClass: { name: string; track_width?: number }, index: number) =>
      `<text x="20" y="${60 + index * 28}">${netClass.name}: ${netClass.track_width ?? "inherited"} mm</text>`,
  )
  const assignments =
    settings.netclass_assignments ??
    Object.fromEntries(
      settings.netclass_patterns.map(
        (pattern: { pattern: string; netclass: string }) => [
          pattern.pattern,
          [pattern.netclass],
        ],
      ),
    )
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="340"><rect width="100%" height="100%" fill="white"/><g font-family="monospace" font-size="16" fill="#111"><text x="20" y="30">Exported KiCad class definitions and assignments</text>${rows.join("")}<text x="20" y="250">VCC: ${assignments.VCC?.join(" + ")}</text><text x="20" y="280">SENSE: ${assignments.SENSE?.join(" + ")}</text></g></svg>`
  await expect(svg).toMatchSvgSnapshot(import.meta.path, "class-identity")
})

test("export preserves class names, unused definitions and multi-class assignments", () => {
  const settings = exportedSettings()
  expect(
    settings.classes.map((netClass: { name: string }) => netClass.name).sort(),
  ).toEqual(["Default", "Inherited", "Power", "Sense", "Unused"])
  expect(settings.netclass_assignments).toEqual({
    SENSE: ["Sense"],
    VCC: ["Inherited", "Power"],
  })
  expect(settings.meta.version).toBe(4)
})
