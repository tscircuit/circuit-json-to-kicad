import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { createAutoroutedInnerLayerVias } from "../../fixtures/create-autorouted-inner-layer-vias"

test("retains route-only vias and their explicit dimensions", async () => {
  const circuitJson = await createAutoroutedInnerLayerVias()
  const physicalVias = circuitJson.filter((e) => e.type === "pcb_via")
  const converter = new CircuitJsonToKicadPcbConverter(
    circuitJson.filter((e) => e.type !== "pcb_via"),
  )
  converter.runUntilFinished()
  expect(converter.getOutput().vias).toHaveLength(2)
  for (const [index, via] of converter.getOutput().vias.entries()) {
    expect(via.size).toBe(physicalVias[index]!.outer_diameter)
    expect(via.drill).toBe(physicalVias[index]!.hole_diameter)
    expect(via.layers?.names).toEqual(["F.Cu", "In1.Cu"])
  }
})
