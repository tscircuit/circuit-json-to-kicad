import { expect, test } from "bun:test"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import sharp from "sharp"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { createStandalonePcbNoteRepro } from "../../fixtures/standalone-pcb-note-repro"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro35: standalone and footprint PCB notes comparison", async () => {
  const circuitJson = await createStandalonePcbNoteRepro()
  const notes = circuitJson.filter(
    (element) => element.type === "pcb_note_text",
  )
  expect(notes).toHaveLength(2)
  expect(
    notes.find((note) => note.text === "BOARD NOTE")?.pcb_component_id,
  ).toBeUndefined()
  expect(
    notes.find((note) => note.text === "FOOTPRINT NOTE")?.pcb_component_id,
  ).toBeDefined()
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const pcb = parseKicadPcb(output)
  // Passing control: component-owned note text is supported by the exporter.
  expect(
    pcb.footprints.flatMap((footprint) =>
      footprint.fpTexts.map((text) => text.text),
    ),
  ).toContain("FOOTPRINT NOTE")
  await Bun.write(
    "debug-output/repro35-standalone-pcb-note-text.kicad_pcb",
    output,
  )
  const snapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "pcb",
    generatePng: false,
  })
  expect(snapshot.exitCode).toBe(0)
  const sourcePng = await sharp(
    await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
  )
    .resize({ width: 800 })
    .png()
    .toBuffer()
  const kicadPng = await sharp(snapshot.generatedFileContent["temp_file.svg"]!)
    .resize({ width: 800 })
    .flatten({ background: "#000" })
    .png()
    .toBuffer()
  await expect(
    stackCircuitJsonKicadPngs(sourcePng, kicadPng),
  ).toMatchPngSnapshot(import.meta.path)
}, 120_000)
