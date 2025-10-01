import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

test("basics03", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board>
      <resistor name="R1" resistance="1k" footprint="0402" />
      <chip
        name="U1"
        footprint="soic8"
        pinLabels={{
          pin1: "GND",
          pin2: "IN1",
          pin3: "IN2",
          pin4: "AGND",
          pin5: "OUT1",
          pin6: "OUT2",
          pin7: "VCC",
          pin8: "NC",
        }}
        connections={{
          pin1: "R1.pin1",
        }}
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  Bun.write(
    "./debug-output/sch-basics03-circuit.json",
    JSON.stringify(circuitJson, null, 2),
  )

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)

  converter.runUntilFinished()

  Bun.write(
    "./debug-output/sch-basics03-kicad.kicad_sch",
    converter.getOutputString(),
  )

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "sch",
  })

  expect(kicadSnapshot.exitCode).toBe(0)

  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "schematic" }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
