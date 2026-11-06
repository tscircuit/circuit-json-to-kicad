import { expect, test } from "bun:test"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { createStandalonePcbNoteRepro } from "../../fixtures/standalone-pcb-note-repro"

test("repro35: standalone PCB note text survives KiCad export", async () => {
  const circuitJson = await createStandalonePcbNoteRepro()
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const pcb = parseKicadPcb(converter.getOutputString())
  // Accept board graphics or footprint text; the note must survive either way.
  const texts = [
    ...pcb.graphicTexts.map((text) => text.text),
    ...pcb.footprints.flatMap((footprint) =>
      footprint.fpTexts.map((text) => text.text),
    ),
  ]
  expect(texts.filter((text) => text === "BOARD NOTE")).toHaveLength(1)
  expect(texts.filter((text) => text === "FOOTPRINT NOTE")).toHaveLength(1)
  const note = pcb.graphicTexts.find((text) => text.text === "BOARD NOTE")!
  expect(note.layer?.names).toEqual(["F.Fab"])
  expect(note.position?.x).toBe(100)
  expect(note.position?.y).toBe(96)
  expect(note.effects?.font?.size).toEqual({ width: 1, height: 1 })
})
