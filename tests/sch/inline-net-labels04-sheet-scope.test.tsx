import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import fixture from "../fixtures/inline-label-sheet-scope.json"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { exportSchematicNetlist } from "../fixtures/export-schematic-netlist"

test("same-named inline labels stay local while explicit global labels cross sheets", async () => {
  // Generated with tscircuit 0.0.2905: two sheets, each with a subcircuit
  // containing the two-resistor auto-label repro plus an explicit SHARED label.
  const converter = new CircuitJsonToKicadSchConverter(fixture as CircuitJson)
  converter.runUntilFinished()
  const files = converter.getOutputFiles({
    schematicFilename: "scope.kicad_sch",
  })
  expect(files).toHaveLength(3)
  for (const file of files.slice(1)) {
    const sch = parseKicadSch(file.content)
    expect(sch.labels.map((label) => label.value)).toEqual(["SIGNAL", "SIGNAL"])
    expect(sch.globalLabels.map((label) => label.value)).toEqual(["SHARED"])
  }
  const nets = await exportSchematicNetlist(files)
  expect(
    nets
      .filter((net) => net.name.endsWith("SIGNAL"))
      .map((net) => net.pins)
      .sort(),
  ).toEqual([
    ["R1.2", "R2.1"],
    ["R3.2", "R4.1"],
  ])
  expect(nets.find((net) => net.name === "SHARED")?.pins).toEqual([
    "R1.1",
    "R3.1",
  ])
})
