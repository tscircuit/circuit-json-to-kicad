import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"
import { parseKicadPcb } from "kicadts"
import sharp from "sharp"
import { CircuitJsonToKicadPcbConverter } from "../../../lib"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

const sourcePath = join(
  import.meta.dir,
  "assets/edge-cuts-circle.source.kicad_pcb",
)

test.failing("repro29: Edge.Cuts circle remains a circle after round trip", async () => {
  const sourceText = await readFile(sourcePath, "utf8")
  const sourceBoard = parseKicadPcb(sourceText)
  expect(sourceBoard.graphicCircles).toHaveLength(1)
  expect(sourceBoard.footprints).toHaveLength(0)

  const importer = new KicadToCircuitJsonConverter()
  importer.addFile("edge-cuts-circle.kicad_pcb", sourceText)
  importer.runUntilFinished()
  const circuitJson = importer.getOutput()
  expect(
    circuitJson.filter((element) => element.type === "pcb_hole"),
  ).toHaveLength(1)

  const exporter = new CircuitJsonToKicadPcbConverter(circuitJson as any)
  exporter.runUntilFinished()
  const roundTripText = exporter.getOutputString()
  const roundTripBoard = parseKicadPcb(roundTripText)
  expect(roundTripBoard.footprints).toHaveLength(1)
  expect(roundTripBoard.footprints[0]?.fpPads[0]?.padType).toBe("np_thru_hole")

  const [sourceSnapshot, roundTripSnapshot] = await Promise.all([
    takeKicadSnapshot({
      kicadFileContent: sourceText,
      kicadFileType: "pcb",
      pcbDrillHoleColor: "white",
    }),
    takeKicadSnapshot({
      kicadFileContent: roundTripText,
      kicadFileType: "pcb",
      pcbDrillHoleColor: "white",
    }),
  ])
  const sourceImage = sourceSnapshot.generatedFileContent["temp_file.png"]!
  const roundTripImage =
    roundTripSnapshot.generatedFileContent["temp_file.png"]!
  const { width, height } = await sharp(sourceImage).metadata()
  if (!width || !height) throw new Error("KiCad produced an empty board image")

  const labels = Buffer.from(`<svg width="${width * 2}" height="36">
    <text x="12" y="26" fill="white" font-size="21">Source: Edge.Cuts circle</text>
    <text x="${width + 12}" y="26" fill="white" font-size="21">Round trip: drilled pad footprint</text>
  </svg>`)
  const comparison = await sharp({
    create: {
      width: width * 2,
      height: height + 36,
      channels: 4,
      background: "#101820",
    },
  })
    .composite([
      { input: labels, left: 0, top: 0 },
      { input: sourceImage, left: 0, top: 36 },
      { input: roundTripImage, left: width, top: 36 },
    ])
    .png()
    .toBuffer()

  expect(comparison).toMatchPngSnapshot(
    import.meta.path,
    "repro29-edge-cuts-circle-roundtrip",
  )

  expect(roundTripBoard.graphicCircles).toHaveLength(1)
  expect(roundTripBoard.footprints).toHaveLength(0)
}, 30_000)
