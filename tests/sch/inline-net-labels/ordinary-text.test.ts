import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { createInlineLabelCircuit } from "../../fixtures/inline-net-labels"

test("unrelated trace annotations stay ordinary text", () => {
  const circuit = createInlineLabelCircuit()
  for (const row of circuit) {
    if (row.type === "schematic_text") row.text = "Test point"
  }
  const converter = new CircuitJsonToKicadSchConverter(circuit)
  converter.runUntilFinished()
  const schematic = converter.getOutput()

  expect(schematic.labels).toHaveLength(0)
  expect(schematic.globalLabels).toHaveLength(0)
  expect(
    schematic.texts.filter((text) => text.value === "Test point"),
  ).toHaveLength(2)
})
