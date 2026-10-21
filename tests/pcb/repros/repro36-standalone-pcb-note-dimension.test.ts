import { expect, test } from "bun:test"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { createStandalonePcbNoteShapeRepro } from "../../fixtures/standalone-pcb-note-shape-repro"

test.failing("repro36: standalone PCB note dimension survives KiCad export", async () => {
  const circuitJson = await createStandalonePcbNoteShapeRepro("dimension")
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const pcb = parseKicadPcb(converter.getOutputString())
  // Accept board graphics or native dimension elements, regardless of representation.
  const annotations = [
    ...pcb.graphicLines,
    ...pcb.graphicPolys,
    ...pcb.graphicTexts,
    ...pcb.graphicRects,
  ].filter((graphic) => !graphic.layer?.names.includes("Edge.Cuts"))
  const dimensions = pcb.otherChildren.filter(
    (child) => child.token === "dimension",
  )
  expect(annotations.length + dimensions.length).toBeGreaterThan(0)
})
