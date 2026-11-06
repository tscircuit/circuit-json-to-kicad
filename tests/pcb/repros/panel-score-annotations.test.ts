import { expect, test } from "bun:test"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { CircuitJsonToKicadPcbConverter } from "lib"
import sharp from "sharp"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("panel score drawing paths survive on native KiCad fabrication layers", async () => {
  const circuitJson = await Bun.file(
    new URL("./assets/panel-score-annotations.json", import.meta.url),
  ).json()
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const snapshot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "pcb",
    pcbLayers: ["Edge.Cuts", "F.Fab", "B.Fab"],
  })
  const sourcePng = await sharp(
    Buffer.from(
      convertCircuitJsonToPcbSvg(circuitJson, { showFabricationNotes: true }),
    ),
  )
    .png()
    .toBuffer()
  const comparisonPng = await stackCircuitJsonKicadPngs(
    sourcePng,
    snapshot.generatedFileContent["temp_file.png"]!,
  )
  await expect(comparisonPng).toMatchPngSnapshot(import.meta.path)
  const scoreLines = converter
    .getOutput()
    .graphicLines.filter((line) =>
      ["F.Fab", "B.Fab"].includes(line.layer?.names[0] ?? ""),
    )
  expect(scoreLines).toHaveLength(2)
  expect(scoreLines.map((line) => line.layer?.names[0]).sort()).toEqual([
    "B.Fab",
    "F.Fab",
  ])
})
