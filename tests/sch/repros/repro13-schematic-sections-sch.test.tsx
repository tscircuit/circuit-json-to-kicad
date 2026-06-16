import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro13 schematic sections snapshot", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="30mm" height="30mm" routingDisabled>
      <schematicsection name="power" displayName="Power" />
      <schematicsection name="filter" displayName="Filter" />
      <schematicsection name="logic" displayName="Logic" />
      <schematicsection name="output" displayName="Output" />

      <capacitor
        name="C1"
        capacitance="100uF"
        footprint="0805"
        schX={-4}
        schY={3}
        schSectionName="power"
      />
      <capacitor
        name="C2"
        capacitance="100nF"
        footprint="0402"
        schX={-2}
        schY={3}
        schSectionName="power"
      />

      <resistor
        name="R1"
        resistance="10k"
        footprint="0402"
        schX={2}
        schY={3}
        schSectionName="filter"
      />
      <capacitor
        name="C3"
        capacitance="10nF"
        footprint="0402"
        schX={4}
        schY={3}
        schSectionName="filter"
      />

      <chip
        name="U1"
        footprint="soic8"
        schX={-3}
        schY={-2}
        schSectionName="logic"
        pinLabels={{
          pin1: "GND",
          pin2: "IN",
          pin3: "OUT",
          pin4: "EN",
          pin5: "NC",
          pin6: "NC",
          pin7: "NC",
          pin8: "VCC",
        }}
        schPinArrangement={{
          leftSide: {
            direction: "top-to-bottom",
            pins: ["VCC", "EN", "IN", "GND"],
          },
          rightSide: {
            direction: "top-to-bottom",
            pins: ["OUT", "NC", "NC", "NC"],
          },
        }}
      />

      <resistor
        name="R2"
        resistance="330"
        footprint="0402"
        schX={3}
        schY={-1}
        schSectionName="output"
      />
      <led
        name="LED1"
        color="red"
        footprint="0603"
        schX={3}
        schY={-3}
        schSectionName="output"
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const output = converter.getOutputString()

  await Bun.write(
    "./tests/assets/repro13-schematic-sections-sch.kicad_sch",
    output,
  )

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
  })

  const stackedSnapshot = await stackCircuitJsonKicadPngs(
    await takeCircuitJsonSnapshot({
      circuitJson,
      outputType: "schematic",
    }),
    kicadSnapshot.generatedFileContent["temp_file.png"]!,
  )

  expect(stackedSnapshot).toMatchPngSnapshot(import.meta.path)

  await Bun.write(
    "./debug-output/repro13-schematic-sections-sch.stacked.png",
    stackedSnapshot,
  )
}, 10_000)
