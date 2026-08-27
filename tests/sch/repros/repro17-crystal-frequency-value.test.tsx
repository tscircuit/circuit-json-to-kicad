import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro17: crystal frequency is preserved in the KiCad value", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board>
      <crystal
        name="Y1"
        frequency="32k"
        loadCapacitance="15pF"
        pinVariant="two_pin"
        schX={0}
        schY={0}
      />
      <capacitor
        name="C10"
        capacitance="15pF"
        footprint="0402"
        schX={-2}
        schY={-2}
      />
      <capacitor
        name="C11"
        capacitance="15pF"
        footprint="0402"
        schX={2}
        schY={-2}
      />
      <trace from=".Y1 > .pin1" to=".C10 > .pin1" />
      <trace from=".Y1 > .pin2" to=".C11 > .pin1" />
      <trace from=".C10 > .pin2" to="net.GND" />
      <trace from=".C11 > .pin2" to="net.GND" />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const crystal = circuitJson.find(
    (element) =>
      element.type === "source_component" && element.ftype === "simple_crystal",
  )
  expect(crystal).toBeDefined()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  expect(converter.getOutputString()).toContain(
    '(property "Value" "32kHz / 15pF"',
  )

  const circuitJsonWithoutLoadCapacitance = circuitJson.map((element) =>
    element === crystal ? { ...element, load_capacitance: undefined } : element,
  )
  const converterWithoutLoadCapacitance = new CircuitJsonToKicadSchConverter(
    circuitJsonWithoutLoadCapacitance,
  )
  converterWithoutLoadCapacitance.runUntilFinished()
  const outputWithoutLoadCapacitance =
    converterWithoutLoadCapacitance.getOutputString()
  expect(outputWithoutLoadCapacitance).toContain('(property "Value" "32kHz"')
  expect(outputWithoutLoadCapacitance).not.toContain(
    '(property "Value" "32kHz /',
  )

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "sch",
  })
  expect(kicadSnapshot.exitCode).toBe(0)

  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({
        circuitJson,
        outputType: "schematic",
      }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
