import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { createConnectedGridBoxes } from "../fixtures/connection-grid-boxes"

test("rejects a symbol too small for distinct grid pins", async () => {
  // At the default 15x scale, this vertical body edge is 0.15 mm tall.
  // Two distinct contacts need at least 1.27 mm on KiCad's connection grid;
  // preserving both the body and the connections cannot satisfy that spacing.
  const circuitJson = await createConnectedGridBoxes({
    spacing: 0.01,
    height: 0.01,
  })
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  expect(() => converter.runUntilFinished()).toThrow(
    "without changing symbol bodies",
  )
  expect(converter.ctx.schematicConnectionGrid).toBeUndefined()
})
