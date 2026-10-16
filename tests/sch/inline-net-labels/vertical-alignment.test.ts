import { expect, test } from "bun:test"
import { getInlineTraceNetLabels } from "lib/schematic/getInlineTraceNetLabels"
import { createWireLabelCircuit } from "../../fixtures/inline-net-labels"

test("a label at the top wire end points down along the wire", () => {
  const circuit = createWireLabelCircuit({ x: 0, y: 2 })
  const [label] = getInlineTraceNetLabels(circuit).labels

  expect(label).toMatchObject({
    anchor_position: { x: 0, y: 2 },
    anchor_side: "top",
  })
})

test("a label at the bottom wire end points up along the wire", () => {
  const circuit = createWireLabelCircuit({ x: 0, y: -2 })
  const [label] = getInlineTraceNetLabels(circuit).labels

  expect(label).toMatchObject({
    anchor_position: { x: 0, y: -2 },
    anchor_side: "bottom",
  })
})
