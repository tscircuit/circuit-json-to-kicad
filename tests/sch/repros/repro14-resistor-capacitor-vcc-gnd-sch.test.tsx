import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro14 resistor-capacitor V3_3/GND schematic snapshot", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="10mm" height="10mm">
      <resistor
        name="R5"
        resistance="1k"
        pcbX={-11.0}
        pcbY={-1.5}
        pcbRotation={90}
        schX={-10}
        schY={2}
      />
      <capacitor
        name="D1"
        capacitance={100}
        pcbX={-8.5}
        pcbY={-1.5}
        pcbRotation={0}
        schX={-10}
        schY={0}
      />
      <trace from="D1.pin2" to="net.GND" />
      <trace from="R5.pin1" to="net.V3_3" />
      <trace from="R5.pin2" to="D1.pin1" />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const output = converter.getOutputString()

  await Bun.write(
    "./debug-output/repro14-resistor-capacitor-vcc-gnd-sch.kicad_sch",
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
    "./debug-output/repro14-resistor-capacitor-vcc-gnd-sch.stacked.png",
    stackedSnapshot,
  )
})
