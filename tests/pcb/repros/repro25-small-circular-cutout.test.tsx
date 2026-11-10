import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import sharp from "sharp"
import { Circuit } from "tscircuit"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("KiCad PCB outline of a 1 mm circular cutout", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={1.8} height={1.4} routingDisabled schematicDisabled>
      <cutout shape="circle" radius={0.5} />
    </board>,
  )
  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadPcbConverter(
    circuit.getCircuitJson(),
    {
      edgeCutsWidth: 0.012,
    },
  )
  converter.runUntilFinished()
  const pcb = converter.getOutput()
  expect(pcb.graphicLines).toHaveLength(4)
  expect(pcb.graphicCircles).toHaveLength(1)

  const plot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "pcb",
    pcbLayers: ["Edge.Cuts"],
    pcbViewport: { x: 99, y: 99.2, width: 2, height: 1.6 },
    generatePng: false,
  })
  const outline = await sharp(plot.generatedFileContent["temp_file.svg"]!)
    .resize(720, 576)
    .flatten({ background: "black" })
    .png()
    .toBuffer()
  await expect(outline).toMatchPngSnapshot(import.meta.path)
})
