import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadSchConverter } from "lib"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import fixture from "./fixtures/repro20-vertical-long-reference.json"

test("repro20: long references collide with vertical resistors and capacitors", async () => {
  const circuitJson = fixture as CircuitJson
  const components = circuitJson.filter(
    (element) => element.type === "source_component",
  )
  expect(components.map((component) => component.name)).toEqual([
    "R_GPIO0_PU",
    "C_REG_OUT_BULK",
    "R1",
    "C1",
  ])
  expect(
    circuitJson
      .filter((element) => element.type === "schematic_component")
      .map((component) => component.symbol_name),
  ).toEqual([
    "boxresistor_down",
    "capacitor_down",
    "boxresistor_down",
    "capacitor_down",
  ])
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  for (const component of components) {
    expect(output).toContain(`(property "Reference" "${component.name}"`)
  }
  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
    fitSchematicToContent: true,
  })
  expect(kicadSnapshot.exitCode).toBe(0)
  await expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "schematic" }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 60_000)
