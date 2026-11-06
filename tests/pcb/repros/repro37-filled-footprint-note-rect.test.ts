import { expect, test } from "bun:test"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { createFilledFootprintNoteRectRepro } from "../../fixtures/filled-footprint-note-rect-repro"

test.failing("repro37: filled footprint PCB note rectangles retain their fill", async () => {
  const circuitJson = await createFilledFootprintNoteRectRepro()
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const rectangles = parseKicadPcb(
    converter.getOutputString(),
  ).footprints.flatMap((footprint) => footprint.fpRects)
  const filled = rectangles.find((rectangle) => (rectangle.start?.x ?? 0) < 0)!
  expect(filled.fill).toBe(true)
})
