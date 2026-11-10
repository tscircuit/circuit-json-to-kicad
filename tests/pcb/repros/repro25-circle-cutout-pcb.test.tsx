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
  expect({
    circles: edgeCircles.map((circle) => ({
      center: [circle.center?.x, circle.center?.y],
      end: [circle.end?.x, circle.end?.y],
    })),
    lineCount: pcb.graphicLines.filter((line) =>
      line.layer?.names.includes("Edge.Cuts"),
    ).length,
  }).toMatchSnapshot()
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
