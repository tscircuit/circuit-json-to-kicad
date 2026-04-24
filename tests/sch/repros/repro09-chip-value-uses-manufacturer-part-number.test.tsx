import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

test("repro09: simple chip schematic value uses manufacturer part number", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board>
      <chip
        name="unnamed_chip1"
        manufacturerPartNumber="MPM3612GLQ_Z"
        footprint="soic8"
        pinLabels={{
          pin1: "EN",
          pin2: "VIN",
          pin3: "GND",
          pin4: "VOUT1",
          pin5: "VOUT2",
          pin6: "FB",
          pin7: "PG",
          pin8: "VCC",
        }}
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const output = converter.getOutputString()
  expect(output).toContain('(property "Value" "MPM3612GLQ_Z"')
  expect(output).not.toContain('(property "Value" "unnamed_chip1"')

  Bun.write(
    "./debug-output/repro09-chip-value-uses-manufacturer-part-number.kicad_sch",
    output,
  )

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
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
