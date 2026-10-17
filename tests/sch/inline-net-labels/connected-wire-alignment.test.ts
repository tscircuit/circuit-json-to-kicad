import { expect, test } from "bun:test"
import type { Point, SchematicText } from "circuit-json"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { applyToPoint } from "transformation-matrix"
import { createInlineLabelCircuit } from "../../fixtures/inline-net-labels"

function convertLoopLabel(
  position: Point,
  anchor: SchematicText["anchor"],
  rotation = 0,
) {
  const circuit = createInlineLabelCircuit()
  for (const row of circuit) {
    if (
      row.type === "schematic_trace" &&
      row.source_trace_id === "source_trace_0"
    ) {
      // With no open end, the label attaches to the nearest wire segment.
      row.edges = [
        { from: { x: 0.3, y: 0 }, to: { x: 4, y: 0 } },
        { from: { x: 4, y: 0 }, to: { x: 4, y: 2 } },
        { from: { x: 4, y: 2 }, to: { x: 0.3, y: 2 } },
        { from: { x: 0.3, y: 2 }, to: { x: 0.3, y: 0 } },
      ]
    }
    if (
      row.type === "schematic_text" &&
      row.source_trace_id === "source_trace_0"
    ) {
      row.position = position
      row.anchor = anchor
      row.rotation = rotation
    }
  }
  const converter = new CircuitJsonToKicadSchConverter(circuit)
  converter.runUntilFinished()
  return {
    label: parseKicadSch(converter.getOutputString()).labels[0],
    transform: converter.ctx.c2kMatSch!,
  }
}

test("a horizontal inline label without an open wire end honors bottom_right", () => {
  const { label, transform } = convertLoopLabel(
    { x: 1, y: 0.06 },
    "bottom_right",
  )
  const expectedPosition = applyToPoint(transform, { x: 1, y: 0 })

  expect(label?.at?.x).toBeCloseTo(expectedPosition.x)
  expect(label?.at?.y).toBeCloseTo(expectedPosition.y)
  expect(label?.at?.angle).toBe(180)
  expect(label?.effects?.justify?.horizontal).toBe("right")
})

test("a vertical inline label without an open wire end honors right alignment", () => {
  const { label, transform } = convertLoopLabel({ x: 4.06, y: 1 }, "right", -90)
  const expectedPosition = applyToPoint(transform, { x: 4, y: 1 })

  expect(label?.at?.x).toBeCloseTo(expectedPosition.x)
  expect(label?.at?.y).toBeCloseTo(expectedPosition.y)
  expect(label?.at?.angle).toBe(270)
  expect(label?.effects?.justify?.horizontal).toBe("right")
})
