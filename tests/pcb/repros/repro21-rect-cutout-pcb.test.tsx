import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

const Repro21RectCutoutPcb = () => (
  <board width="30mm" height="20mm">
    <cutout shape="rect" width="5mm" height="3mm" pcbX="-10mm" pcbY="0mm" />
    <cutout shape="circle" radius="2mm" pcbX="0mm" pcbY="0mm" />
    <cutout
      shape="polygon"
      points={[
        { x: 5, y: -2 },
        { x: 8, y: 0 },
        { x: 5, y: 2 },
        { x: 6, y: 0 },
      ]}
      pcbX="5mm"
      pcbY="0mm"
    />
  </board>
)

export default Repro21RectCutoutPcb

test("pcb repro21 cutout shapes are emitted on Edge.Cuts", async () => {
  const circuit = new Circuit()
  circuit.add(<Repro21RectCutoutPcb />)

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const outputString = converter.getOutputString()

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: outputString,
    kicadFileType: "pcb",
  })

  expect(kicadSnapshot.exitCode).toBe(0)

  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({
        circuitJson,
        outputType: "pcb",
      }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
