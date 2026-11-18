import { expect, test } from "bun:test"
import "bun-match-svg"
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadProConverter,
} from "lib"
import { circuitJson, netSettings } from "../fixtures/imported-kicad-settings"

function exportedSettings() {
  return JSON.parse(
    new CircuitJsonToKicadProConverter(circuitJson).getOutputString(),
  ).net_settings
}

test("snapshot retained KiCad settings at the export boundary", async () => {
  const settings = exportedSettings()
  const rows = settings.classes.map(
    (netClass: { name: string; track_width?: number }, index: number) =>
      `<text x="20" y="${60 + index * 28}">${netClass.name}: ${netClass.track_width ?? "inherited"} mm</text>`,
  )
  const assignments = settings.netclass_assignments ?? {}
  const pcb = new CircuitJsonToKicadPcbConverter(circuitJson)
  pcb.runUntilFinished()
  const names = pcb
    .getOutput()
    .nets.map((net) => net.name)
    .filter(Boolean)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="370"><rect width="100%" height="100%" fill="white"/><g font-family="monospace" font-size="16" fill="#111"><text x="20" y="30">Imported KiCad rules are preservation metadata</text>${rows.join("")}<text x="20" y="250">/POWER/VCC+: ${assignments["/POWER/VCC+"]?.join(" + ") ?? "MISSING"}</text><text x="20" y="280">SENSE[0]: ${assignments["SENSE[0]"]?.join(" + ") ?? "MISSING"}</text><text x="20" y="310">Exported PCB nets: ${names.join(", ")}</text></g></svg>`
  await expect(svg).toMatchSvgSnapshot(import.meta.path, "class-identity")
})

test("export retains imported settings without interpreting them as native classes", () => {
  expect(exportedSettings()).toEqual(netSettings)
})

test("PCB export restores original names so imported assignments still match", () => {
  const pcb = new CircuitJsonToKicadPcbConverter(circuitJson)
  pcb.runUntilFinished()
  expect(
    pcb
      .getOutput()
      .nets.map((net) => net.name)
      .filter(Boolean)
      .sort(),
  ).toEqual(["/POWER/VCC+", "SENSE[0]"])
})
