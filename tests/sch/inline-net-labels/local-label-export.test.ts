import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { createInlineLabelCircuit } from "../../fixtures/inline-net-labels"

test("automatic SIGNAL text exports as local electrical labels", () => {
  const converter = new CircuitJsonToKicadSchConverter(
    createInlineLabelCircuit(),
  )
  converter.runUntilFinished()
  const schematic = converter.getOutput()

  expect(schematic.labels.map((label) => label.value)).toEqual([
    "SIGNAL",
    "SIGNAL",
  ])
  expect(schematic.globalLabels).toHaveLength(0)
  expect(schematic.texts.some((text) => text.value === "SIGNAL")).toBe(false)
})
