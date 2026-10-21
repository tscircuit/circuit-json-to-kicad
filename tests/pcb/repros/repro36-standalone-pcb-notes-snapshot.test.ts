import { expect, test } from "bun:test"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import sharp from "sharp"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { createStandalonePcbNotesRepro } from "../../fixtures/standalone-pcb-notes-repro"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro36: standalone PCB note rectangles, lines, paths, and dimensions comparison", async () => {
  const circuitJson = await createStandalonePcbNotesRepro()
  for (const type of [
    "pcb_note_rect",
    "pcb_note_line",
    "pcb_note_path",
    "pcb_note_dimension",
  ] as const) {
    const notes = circuitJson.filter((element) => element.type === type)
    expect(
      notes.filter(
        (note) => !("pcb_component_id" in note) || !note.pcb_component_id,
      ),
    ).toHaveLength(1)
  }
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const pcb = parseKicadPcb(output)
  // Component-owned note rectangles provide a passing export control.
  expect(pcb.footprints.flatMap((footprint) => footprint.fpRects)).toHaveLength(
    1,
  )
  await Bun.write("debug-output/repro36-standalone-pcb-notes.kicad_pcb", output)
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
