import { expect, test } from "bun:test"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import type { CircuitJson, PcbSolderPaste } from "circuit-json"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import sharp from "sharp"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro37: polygon solder-paste holes are lost", async () => {
  // Polygon holes are part of Circuit JSON but are not currently exposed by
  // the <solderpaste> JSX element, so this adds only that unsupported JSX shape
  // to the otherwise TSX-based visual reproduction.
  const solderPaste = {
    type: "pcb_solder_paste",
    shape: "polygon",
    pcb_solder_paste_id: "pcb_solder_paste_with_hole",
    layer: "top",
    points: [
      { x: -3, y: -3 },
      { x: 3, y: -3 },
      { x: 3, y: 3 },
      { x: -3, y: 3 },
    ],
    holes: [
      [
        { x: -2, y: -2 },
        { x: -2, y: 2 },
        { x: 2, y: 2 },
        { x: 2, y: -2 },
      ],
    ],
  } satisfies PcbSolderPaste
  const circuitJson: CircuitJson = [solderPaste]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const pcb = KicadPcb.parse(output)[0] as KicadPcb
  const exportedPastePads = pcb.footprints.flatMap((footprint) =>
    footprint.fpPads.filter((pad) =>
      pad.layers?.layers.some((layer) => layer.endsWith(".Paste")),
    ),
  )

  // The standalone polygon aperture, including its hole, is dropped.
  expect(exportedPastePads).toHaveLength(0)

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "pcb",
    generatePng: false,
    pcbLayers: ["F.Paste"],
  })
  expect(kicadSnapshot.exitCode).toBe(0)

  const circuitJsonSvg = convertCircuitJsonToPcbSvg(circuitJson, {
    width: 600,
    height: 400,
    includeVersion: false,
    showCourtyards: false,
    showSolderPaste: true,
  })
  await expect(
    stackCircuitJsonKicadPngs(
      await sharp(Buffer.from(circuitJsonSvg)).png().toBuffer(),
      await sharp(kicadSnapshot.generatedFileContent["temp_file.svg"]!)
        .resize({ width: 600 })
        .flatten({ background: "black" })
        .png()
        .toBuffer(),
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 120_000)
