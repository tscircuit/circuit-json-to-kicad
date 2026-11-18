import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadProConverter,
} from "lib"
import { circuitJson } from "./fixtures/imported-kicad-settings"

test("legacy KiCad settings remain opaque, including member lists and string assignments", () => {
  for (const settings of [
    {
      meta: { version: 2 },
      classes: [{ name: "Power", nets: ["VCC"], clearance: 0.3 }],
    },
    {
      meta: { version: 3 },
      netclass_assignments: { VCC: "Power" },
      netclass_patterns: null,
    },
  ]) {
    const input: CircuitJson = [
      {
        type: "source_project_metadata",
        metadata: { kicad_project: { net_settings: settings } },
      },
    ]
    expect(
      JSON.parse(new CircuitJsonToKicadProConverter(input).getOutputString())
        .net_settings,
    ).toMatchObject(settings)
  }
})

test("export does not share mutable imported settings with its input", () => {
  const input = structuredClone(circuitJson)
  const before = structuredClone(input)
  const project = new CircuitJsonToKicadProConverter(input)
  project.getOutput().net_settings.classes[0]!.track_width = 0.99
  expect(input).toEqual(before)
})

test("multiple imported project settings require separate exports", () => {
  expect(
    () =>
      new CircuitJsonToKicadProConverter([circuitJson[0]!, circuitJson[0]!]),
  ).toThrow("Cannot export net settings from multiple imported KiCad projects")
})

test("an explicit rename uses the current native net name", () => {
  const input = structuredClone(circuitJson)
  const net = input.find((element) => element.type === "source_net")!
  if (net.type !== "source_net") throw new Error("Missing net")
  net.name = "RENAMED_POWER"
  const pcb = new CircuitJsonToKicadPcbConverter(input)
  pcb.runUntilFinished()
  expect(pcb.getOutput().nets.map((net) => net.name)).toContain("RENAMED_POWER")
  expect(pcb.getOutput().nets.map((net) => net.name)).not.toContain(
    "/POWER/VCC+",
  )
})
