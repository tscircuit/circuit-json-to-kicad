import { expect, test } from "bun:test"
import { Circuit } from "tscircuit-latest"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { parseKicadSch } from "kicadts"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackSchematicCircuitJsonKicadPngs } from "../../fixtures/stackSchematicCircuitJsonKicadPngs"

const TestpointPad = () => (
  <testpoint
    name="TCH1"
    footprintVariant="pad"
    padShape="circle"
    padDiameter="1mm"
  />
)

export default TestpointPad

test("repro16 testpoint pad schematic", async () => {
  const circuit = new Circuit()
  circuit.add(<TestpointPad />)
  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const parsedSchematic = parseKicadSch(output)
  const testpointSymbol = parsedSchematic.symbols.find((symbol) =>
    symbol.properties.some(
      (property) => property.key === "Reference" && property.value === "TCH1",
    ),
  )
  const referenceProperty = testpointSymbol?.properties.find(
    (property) => property.key === "Reference",
  )
  const valueProperty = testpointSymbol?.properties.find(
    (property) => property.key === "Value",
  )

  expect(referenceProperty?.effects?.justify?.horizontal).toBe("left")
  expect(valueProperty?.effects?.hiddenText).toBe(true)

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
