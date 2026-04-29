import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

test("repro10 pinheader schematic unknown symbol", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="30mm" height="30mm">
      <pinheader
        name="J2"
        pinCount={8}
        gender="male"
        pitch="2.54mm"
        footprint="pinrow8_rows2"
        doubleRow={true}
        showSilkscreenPinLabels={true}
        pinLabels={["VCC", "GND", "SDA", "SCL", "MISO", "MOSI", "SCK", "CS"]}
        pcbX={0}
        pcbY={10}
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const output = converter.getOutputString()

  Bun.write("./debug-output/repro10-pinheader-unknown-symbol.kicad_sch", output)

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
