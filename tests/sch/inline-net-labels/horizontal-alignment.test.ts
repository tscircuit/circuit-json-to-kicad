import { expect, test } from "bun:test"
import { convertWireLabelCircuit } from "../../fixtures/inline-net-labels"

test("a label at the right wire end points left along the wire", () => {
  const { label, anchor } = convertWireLabelCircuit({ x: 2, y: 0 })

  expect(label?.at?.x).toBeCloseTo(anchor.x)
  expect(label?.at?.y).toBeCloseTo(anchor.y)
  expect(label?.at?.angle).toBe(180)
  expect(label?.effects?.justify?.horizontal).toBe("right")
})

test("a label at the left wire end points right along the wire", () => {
  const { label, anchor } = convertWireLabelCircuit({ x: -2, y: 0 })

  expect(label?.at?.x).toBeCloseTo(anchor.x)
  expect(label?.at?.y).toBeCloseTo(anchor.y)
  expect(label?.at?.angle).toBe(0)
  expect(label?.effects?.justify?.horizontal).toBe("left")
})
