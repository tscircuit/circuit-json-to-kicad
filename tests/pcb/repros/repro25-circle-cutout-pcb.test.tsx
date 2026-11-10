import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

const Repro25CircleCutoutPcb = () => (
  <board width="10mm" height="10mm">
    <cutout shape="circle" radius="1.651mm" />
    <cutout shape="circle" radius="1.651mm" pcbX={5} />
    <cutout shape="circle" radius="1.651mm" pcbX={-5} />
    <cutout shape="circle" radius="1.651mm" pcbY={-5} />
    <cutout shape="circle" radius="1.651mm" pcbY={5} />
  </board>
)

export default Repro25CircleCutoutPcb

const createRepro25CircuitJson = async () => {
  const circuit = new Circuit()
  circuit.add(<Repro25CircleCutoutPcb />)

  await circuit.renderUntilSettled()

  return circuit.getCircuitJson() as any[]
}

test("pcb repro25 circle cutouts match snapshot", async () => {
  const circuitJson = await createRepro25CircuitJson()

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const pcb = converter.getOutput()
  const edgeCircles = pcb.graphicCircles.filter((circle) =>
    circle.layer?.names.includes("Edge.Cuts"),
  )
  expect(edgeCircles).toHaveLength(1)
  expect(edgeCircles[0]?.centerPoint).toEqual({ x: 100, y: 100 })
  expect(edgeCircles[0]?.endPoint).toEqual({ x: 101.651, y: 100 })
  expect(
    pcb.graphicLines.filter((line) => line.layer?.names.includes("Edge.Cuts")),
  ).toHaveLength(112)
  const outputString = converter.getOutputString()

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: outputString,
    kicadFileType: "pcb",
  })

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
