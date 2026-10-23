import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

const Box = ({ width }: { width: number }) => (
  <symbol name="Shared" width={width}>
    <schematicrect width={2} height={0.8} strokeWidth={0.05} />
    <schematictext text="{REF}" schX={0} schY={0} fontSize={0.15} />
    <port name="1" pinNumber={1} direction="right" schX={1} schY={0} />
  </symbol>
)

const Example = () => (
  <board>
    <chip name="A1" schY={3} symbol={<Box width={2} />} />
    <resistor name="R1" resistance="1k" schX={6} schY={3} />
    <trace from=".A1 > .pin1" to=".R1 > .pin1" />

    <chip name="A2" schY={0} symbol={<Box width={4} />} />
    <resistor name="R2" resistance="1k" schX={6} schY={0} />
    <trace from=".A2 > .pin1" to=".R2 > .pin1" />

    <chip name="A3" schY={-3} symbol={<Box width={2} />} />
    <resistor name="R3" resistance="1k" schX={6} schY={-3} />
    <trace from=".A3 > .pin1" to=".R3 > .pin1" />
  </board>
)

export default Example

test("repro663: same-name custom symbols with different widths", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(<Example />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const snapshot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "sch",
  })
  await expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "schematic" }),
      snapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
