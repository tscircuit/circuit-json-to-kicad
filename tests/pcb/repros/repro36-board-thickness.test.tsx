import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { createAutoroutedInnerLayerVias } from "../../fixtures/create-autorouted-inner-layer-vias"

// Asserts correct behavior; remove .failing when the stacked exporter fix lands.
test.failing("preserves explicit board thickness and retains the legacy absent-board default", async () => {
  for (const thickness of [0.8, 1.4, 2]) {
    const circuitJson = createAutoroutedInnerLayerVias().map((element) =>
      element.type === "pcb_board" ? { ...element, thickness } : element,
    )
    const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
    converter.runUntilFinished()
    expect(converter.getOutput().general?.thickness).toBe(thickness)
  }
  const converter = new CircuitJsonToKicadPcbConverter([])
  converter.runUntilFinished()
  expect(converter.getOutput().general?.thickness).toBe(1.6)
})
