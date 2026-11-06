import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

const Example = () => (
  <board>
    <resistor name="R16" resistance="316" schX={0} schY={0} schRotation={90} />
    <resistor name="R17" resistance="316" schX={2} schY={0} schRotation={90} />
    <resistor name="R18" resistance="1k" schX={5} schY={0} schRotation={90} />
    <net name="VLS" isPowerNet />
    <trace from=".R16 > .pin2" to=".R17 > .pin2" />
    <netlabel net="VLS" anchorSide="bottom" schX={1} schY={0.5} />
    <netlabel net="VLS" connectsTo=".R18 > .pin2" schX={5} schY={1} />
  </board>
)

export default Example

test("repro: VLS rail on wire interior schematic snapshot", async () => {
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
