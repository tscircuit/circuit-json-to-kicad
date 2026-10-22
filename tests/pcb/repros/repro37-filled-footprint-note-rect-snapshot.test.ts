import { expect, test } from "bun:test"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import sharp from "sharp"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { createFilledFootprintNoteRectRepro } from "../../fixtures/filled-footprint-note-rect-repro"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro37: filled and outline footprint PCB note rectangles comparison", async () => {
  const circuitJson = await createFilledFootprintNoteRectRepro()
  const sourceRectangles = circuitJson.filter(
    (element) => element.type === "pcb_note_rect",
  )
  expect(sourceRectangles).toHaveLength(2)
  expect(
    sourceRectangles.every((rectangle) => rectangle.pcb_component_id),
  ).toBe(true)
  expect(
    sourceRectangles.filter((rectangle) => rectangle.is_filled),
  ).toHaveLength(1)
  expect(
    sourceRectangles.filter((rectangle) => !rectangle.is_filled),
  ).toHaveLength(1)
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const pcb = parseKicadPcb(output)
  const rectangles = pcb.footprints.flatMap((footprint) => footprint.fpRects)
  expect(rectangles).toHaveLength(2)
  // The outline rectangle is a passing control for the fill-only regression.
  const outline = rectangles.find((rectangle) => (rectangle.start?.x ?? 0) > 0)!
  expect(outline.fill).toBe(false)
  await Bun.write(
    "debug-output/repro37-filled-footprint-note-rect.kicad_pcb",
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
