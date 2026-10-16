import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { createSchematicGridCircuit } from "../../fixtures/create-schematic-grid-circuit"

test.failing("grid alignment rejects a grid that would merge distinct pins", async () => {
  const circuitJson = await createSchematicGridCircuit()
  const options = { schematicGridSize: 1000, paperSize: undefined }
  const converter = new CircuitJsonToKicadSchConverter(circuitJson, options)
  expect(() => converter.runUntilFinished()).toThrow(/grid.*smaller grid/)
})
