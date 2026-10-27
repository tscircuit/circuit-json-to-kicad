import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import sharp from "sharp"
import fixture from "../../fixtures/circuit-json/open-ring-flex-via-depth.json"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

// Original pcb_via_356 and six adjacent FLASH_OUT trace points, with a cropped
// board boundary. Via depth, coordinates, diameters and trace width are unchanged.
test("repro: open-ring-flex blind via appears on bottom copper", async () => {
  const circuitJson = fixture as CircuitJson
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const snapshot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "pcb",
    pcbLayers: ["B.Cu", "Edge.Cuts"],
    pcbDrillHoleColor: "white",
    generatePng: false,
  })
  const circuitJsonPng = await sharp(
    Buffer.from(
      convertCircuitJsonToPcbSvg(circuitJson, {
        layer: "bottom",
        hiddenLayerOpacity: 0,
        drawPaddingOutsideBoard: false,
        width: 800,
        height: 686,
      }),
    ),
  )
    .png()
    .toBuffer()
  const kicadPng = await sharp(snapshot.generatedFileContent["temp_file.svg"]!)
    .resize({ width: 800 })
    .flatten({ background: "#000" })
    .png()
    .toBuffer()
  await expect(
    stackCircuitJsonKicadPngs(circuitJsonPng, kicadPng),
  ).toMatchPngSnapshot(import.meta.path)
}, 30_000)
