import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

const TestpointPad = () => (
  <testpoint
    name="TCH1"
    footprintVariant="pad"
    padShape="circle"
    padDiameter="1mm"
  />
)

export default TestpointPad

const createTestpointConverter = async () => {
  const circuit = new Circuit()
  circuit.add(<TestpointPad />)
  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  return { circuitJson, converter }
}

test("uses symbol text semantics for testpoint properties", async () => {
  const { converter } = await createTestpointConverter()
  const output = converter.getOutputString()

  expect(output).toMatch(/property "Reference" "TCH1"[\s\S]*justify left/)
  expect(output).toMatch(/property "Value" "TCH1"[\s\S]*hide/)
})

test("repro16 testpoint pad schematic", async () => {
  const { circuitJson, converter } = await createTestpointConverter()
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
