import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { createInlineLabelCircuit } from "../../fixtures/inline-net-labels"

test("automatic SIGNAL text exports as local electrical labels", () => {
  const circuit = createInlineLabelCircuit()
  const originalCircuit = structuredClone(circuit)
  const converter = new CircuitJsonToKicadSchConverter(circuit)
  converter.runUntilFinished()
  const schematic = converter.getOutput()

  expect(schematic.labels.map((label) => label.value)).toEqual([
    "SIGNAL",
    "SIGNAL",
  ])
  expect(schematic.globalLabels).toHaveLength(0)
  expect(schematic.texts.some((text) => text.value === "SIGNAL")).toBe(false)
  expect(circuit).toEqual(originalCircuit)
  expect(converter.ctx.db.schematic_net_label.list()).toHaveLength(0)
})

test("an explicit net label keeps its existing global scope", () => {
  const circuit = createInlineLabelCircuit().filter(
    (row) => row.type !== "schematic_text",
  )
  circuit.push({
    type: "schematic_net_label",
    schematic_net_label_id: "explicit_signal",
    source_net_id: "source_net_0",
    text: "SIGNAL",
    center: { x: 1.06, y: 0 },
    anchor_position: { x: 1.06, y: 0 },
    anchor_side: "left",
  })
  const converter = new CircuitJsonToKicadSchConverter(circuit)
  converter.runUntilFinished()
  const schematic = parseKicadSch(converter.getOutputString())

  expect(schematic.labels).toHaveLength(0)
  expect(schematic.globalLabels.map((label) => label.value)).toEqual(["SIGNAL"])
})
