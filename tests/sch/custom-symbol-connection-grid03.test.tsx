import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { createConnectedGridBoxes } from "../fixtures/connection-grid-boxes"

test("rejects a symbol too small for distinct grid pins", async () => {
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
