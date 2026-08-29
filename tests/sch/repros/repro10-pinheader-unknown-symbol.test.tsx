import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackSchematicCircuitJsonKicadPngs } from "../../fixtures/stackSchematicCircuitJsonKicadPngs"

test("repro10 pinheaders keep distinct embedded symbols", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="30mm" height="30mm">
      <pinheader
        name="J_INPUT"
        pinCount={2}
        gender="male"
        pitch="2.54mm"
        footprint="pinrow2"
        showSilkscreenPinLabels={true}
        pinLabels={["VIN", "GND"]}
        schX={-2}
        schY={0}
        pcbX={-2}
        pcbY={0}
      />
      <pinheader
        name="J_OUTPUT"
        pinCount={2}
        gender="female"
        pitch="2.54mm"
        footprint="pinrow2"
        showSilkscreenPinLabels={true}
        pinLabels={["LEFT", "RIGHT"]}
        schX={2}
        schY={0}
        pcbX={2}
        pcbY={0}
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const output = converter.getOutputString()

  expect(output).toContain('(symbol "Connector_Generic:Conn_01x2_J_INPUT"')
  expect(output).toContain('(symbol "Connector_Generic:Conn_01x2_J_OUTPUT"')

  Bun.write("./debug-output/repro10-pinheader-unknown-symbol.kicad_sch", output)

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
  })

  expect(kicadSnapshot.exitCode).toBe(0)

  expect(
    stackSchematicCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({
        circuitJson,
        outputType: "schematic",
      }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
