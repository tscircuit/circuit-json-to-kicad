import { expect, test } from "bun:test"
import { convertWireLabelCircuit } from "../../fixtures/inline-net-labels"

test("a label at the top wire end points down along the wire", () => {
  const { label, anchor } = convertWireLabelCircuit({ x: 0, y: 2 })

  expect(label?.at?.x).toBeCloseTo(anchor.x)
  expect(label?.at?.y).toBeCloseTo(anchor.y)
  expect(label?.at?.angle).toBe(270)
  expect(label?.effects?.justify?.horizontal).toBe("right")
})

test("a label at the bottom wire end points up along the wire", () => {
  const { label, anchor } = convertWireLabelCircuit({ x: 0, y: -2 })

  expect(label?.at?.x).toBeCloseTo(anchor.x)
  expect(label?.at?.y).toBeCloseTo(anchor.y)
  expect(label?.at?.angle).toBe(90)
  expect(label?.effects?.justify?.horizontal).toBe("left")
})
