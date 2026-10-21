import { expect, test } from "bun:test"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import sharp from "sharp"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { createStandalonePcbNoteRectRepro } from "../../fixtures/standalone-pcb-note-rect-repro"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro36: standalone and footprint PCB note rectangles comparison", async () => {
  const circuitJson = await createStandalonePcbNoteRectRepro()
  const notes = circuitJson.filter(
    (element) => element.type === "pcb_note_rect",
  )
  expect(notes).toHaveLength(2)
  expect(notes.filter((note) => !note.pcb_component_id)).toHaveLength(1)
  expect(notes.filter((note) => note.pcb_component_id)).toHaveLength(1)
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const pcb = parseKicadPcb(output)
  // Component-owned note rectangles provide a passing export control.
  expect(pcb.footprints.flatMap((footprint) => footprint.fpRects)).toHaveLength(
    1,
  )
  await Bun.write(
    "debug-output/repro36-standalone-pcb-note-rect.kicad_pcb",
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
