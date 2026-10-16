import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { createInlineLabelCircuit } from "../../fixtures/inline-net-labels"

test("SIGNAL stays ordinary text when there is no wire to attach a label to", () => {
  const circuit = createInlineLabelCircuit().filter(
    (row) => row.type !== "schematic_trace",
  )
  const converter = new CircuitJsonToKicadSchConverter(circuit)
  converter.runUntilFinished()
  const schematic = converter.getOutput()

  expect(schematic.labels).toHaveLength(0)
  expect(
    schematic.texts.filter((text) => text.value === "SIGNAL"),
  ).toHaveLength(2)
})
