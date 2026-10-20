import { expect, test } from "bun:test"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { createStandalonePcbNoteRepro } from "../../fixtures/standalone-pcb-note-repro"

test.failing("repro35: standalone PCB note text survives KiCad export", async () => {
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
  expect(texts).toContain("BOARD NOTE")
})
