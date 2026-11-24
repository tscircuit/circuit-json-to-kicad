import { expect, test } from "bun:test"
import { parseKicadSch, Xy } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { createSchematicGridCircuit } from "../../fixtures/create-schematic-grid-circuit"
import { getNativeSchematicNetGroups } from "../../fixtures/get-native-schematic-net-groups"

test("the standard 50 mil grid retains native net connectivity", async () => {
  const circuitJson = await createSchematicGridCircuit()
  const options = { schematicGridSize: 1.27, paperSize: undefined }
  const converter = new CircuitJsonToKicadSchConverter(circuitJson, options)
  converter.runUntilFinished()
  const content = converter.getOutputString()
  const schematic = parseKicadSch(content)
  for (const wire of schematic.wires) {
    for (const point of wire.points?.points ?? []) {
      if (!(point instanceof Xy)) continue
      for (const coordinate of [point.x, point.y]) {
        expect(coordinate / 1.27).toBeCloseTo(Math.round(coordinate / 1.27), 6)
      }
    }
  }
  const groups = await getNativeSchematicNetGroups(content)
  expect(groups).toContainEqual(["L1.2", "R1.1", "R3.1"])
  expect(groups).toContainEqual(["L2.2", "R2.1"])
}, 30_000)
