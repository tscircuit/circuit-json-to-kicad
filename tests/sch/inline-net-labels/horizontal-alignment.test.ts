import { expect, test } from "bun:test"
import { getInlineTraceNetLabels } from "lib/schematic/getInlineTraceNetLabels"
import { createWireLabelCircuit } from "../../fixtures/inline-net-labels"

test("a label at the right wire end points left along the wire", () => {
  const circuit = createWireLabelCircuit({ x: 2, y: 0 })
  const [label] = getInlineTraceNetLabels(circuit).labels

  expect(label).toMatchObject({
    anchor_position: { x: 2, y: 0 },
    anchor_side: "right",
  })
})

test("a label at the left wire end points right along the wire", () => {
  const circuit = createWireLabelCircuit({ x: -2, y: 0 })
  const [label] = getInlineTraceNetLabels(circuit).labels

  expect(label).toMatchObject({
    anchor_position: { x: -2, y: 0 },
    anchor_side: "left",
  })
})
