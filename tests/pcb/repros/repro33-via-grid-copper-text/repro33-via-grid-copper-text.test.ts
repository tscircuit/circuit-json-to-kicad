import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"
import { parseKicadPcb } from "kicadts"
import sharp from "sharp"
import { CircuitJsonToKicadPcbConverter } from "../../../../lib"
import { stackPngsVertically } from "../../../fixtures/stackPngsVertically"
import { takeKicadSnapshot } from "../../../fixtures/take-kicad-snapshot"
import "../../../fixtures/png-matcher"

// Source: kicad-to-circuit-json/tests/assets/via_grid_template.kicad_pcb
test.failing("exports copper labels from the real via-grid board", async () => {
  const source = readFileSync(
    resolve(import.meta.dir, "via_grid_template.kicad_pcb"),
    "utf8",
  )
  const importer = new KicadToCircuitJsonConverter()
  importer.addFile("via_grid_template.kicad_pcb", source)
  importer.runUntilFinished()
  const circuitJson = importer.getOutput()
  const importedLabels = circuitJson.filter(
    (element) => element.type === "pcb_copper_text",
  )
  expect(importedLabels).toHaveLength(4)

  const exporter = new CircuitJsonToKicadPcbConverter(circuitJson as any, {
    projectName: "via-grid-copper-text",
  })
  exporter.runUntilFinished()
  const exported = exporter.getOutputString()

  const [sourceSnapshot, exportedSnapshot] = await Promise.all([
    takeKicadSnapshot({
      kicadFileContent: source,
      kicadFileType: "pcb",
      pcbCopperPourOpacity: 0.35,
    }),
    takeKicadSnapshot({
      kicadFileContent: exported,
      kicadFileType: "pcb",
      pcbCopperPourOpacity: 0.35,
    }),
  ])
  const sourcePng = sourceSnapshot.generatedFileContent["temp_file.png"]!
  const exportedPng = exportedSnapshot.generatedFileContent["temp_file.png"]!
  // Crop the lower-left board legend from each actual KiCad render.
  const cropLegend = async (png: Buffer) => {
    const { height } = await sharp(png).metadata()
    return sharp(png)
      .extract({ left: 0, top: height! - 160, width: 500, height: 160 })
      .resize({ width: 1000 })
      .png()
      .toBuffer()
  }
  const comparison = await stackPngsVertically([
    await cropLegend(sourcePng),
    await cropLegend(exportedPng),
  ])
  await expect(comparison).toMatchPngSnapshot(import.meta.path)

  const copperLabels = (board: ReturnType<typeof parseKicadPcb>) =>
    board.graphicTexts
      .filter((text) => /[FB]\.Cu/.test(text.layer?.getString() ?? ""))
      .map((text) => text.text)
      .sort()
  const sourceLabels = copperLabels(parseKicadPcb(source))
  expect(sourceLabels).toHaveLength(4)
  expect(copperLabels(parseKicadPcb(exported))).toEqual(sourceLabels)
}, 120_000)
