import { expect, test } from "bun:test"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { createStandalonePcbNoteRectRepro } from "../../fixtures/standalone-pcb-note-rect-repro"

test.failing("repro36: standalone PCB note rectangle survives KiCad export", async () => {
  const circuitJson = await createStandalonePcbNoteRectRepro()
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const pcb = parseKicadPcb(converter.getOutputString())
  // Accept native rectangles, polygon outlines, or line segments.
  const rectangles = [
    ...pcb.graphicRects,
    ...pcb.graphicPolys,
    ...pcb.graphicLines,
    ...pcb.footprints.flatMap((footprint) => [
      ...footprint.fpRects,
      ...footprint.fpPolys,
      ...footprint.fpLines,
    ]),
  ]
  const outlines = rectangles.filter((shape) =>
    shape.layer?.names.includes("F.Fab"),
  )
  // One standalone rectangle and one component-owned control must survive.
  expect(outlines.length).toBeGreaterThanOrEqual(2)
})
