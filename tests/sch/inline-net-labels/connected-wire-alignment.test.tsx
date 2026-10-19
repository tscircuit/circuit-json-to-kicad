import { expect, test } from "bun:test"
import type { Point, SchematicText } from "circuit-json"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { applyToPoint } from "transformation-matrix"
import { Circuit } from "tscircuit-latest"

async function convertLoopLabel({
  position,
  anchor,
  rotation = 0,
}: {
  position: Point
  anchor: SchematicText["anchor"]
  rotation?: number
}) {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm" routingDisabled schMaxTraceDistance={1}>
      <resistor name="R1" resistance="1k" footprint="0402" schX={-1.5} />
      <resistor name="R2" resistance="1k" footprint="0402" schX={1.5} />
      <trace from=".R1 > .pin2" to="net.SIGNAL" />
      <trace from=".R2 > .pin1" to="net.SIGNAL" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const text = circuitJson.find(
    (row) => row.type === "schematic_text" && row.text === "SIGNAL",
  )
  if (text?.type !== "schematic_text") throw new Error("Missing SIGNAL text")
  const trace = circuitJson.find(
    (row) =>
      row.type === "schematic_trace" &&
      row.source_trace_id === text.source_trace_id,
  )
  if (trace?.type !== "schematic_trace") throw new Error("Missing SIGNAL wire")
  // With no open end, the label attaches to the nearest wire segment.
  trace.edges = [
    { from: { x: 0, y: 0 }, to: { x: 4, y: 0 } },
    { from: { x: 4, y: 0 }, to: { x: 4, y: 2 } },
    { from: { x: 4, y: 2 }, to: { x: 0, y: 2 } },
    { from: { x: 0, y: 2 }, to: { x: 0, y: 0 } },
  ]
  text.position = position
  text.anchor = anchor
  text.rotation = rotation
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  return {
    label: parseKicadSch(converter.getOutputString()).labels[0],
    transform: converter.ctx.c2kMatSch!,
  }
}

test("a horizontal inline label without an open wire end honors bottom_right", async () => {
  const { label, transform } = await convertLoopLabel({
    position: { x: 1, y: 0.06 },
    anchor: "bottom_right",
  })
  const expectedPosition = applyToPoint(transform, { x: 1, y: 0 })

  expect(label?.at?.x).toBeCloseTo(expectedPosition.x)
  expect(label?.at?.y).toBeCloseTo(expectedPosition.y)
  expect(label?.at?.angle).toBe(180)
  expect(label?.effects?.justify?.horizontal).toBe("right")
})

test("a vertical inline label without an open wire end honors right alignment", async () => {
  const { label, transform } = await convertLoopLabel({
    position: { x: 4.06, y: 1 },
    anchor: "right",
    rotation: -90,
  })
  const expectedPosition = applyToPoint(transform, { x: 4, y: 1 })

  expect(label?.at?.x).toBeCloseTo(expectedPosition.x)
  expect(label?.at?.y).toBeCloseTo(expectedPosition.y)
  expect(label?.at?.angle).toBe(270)
  expect(label?.effects?.justify?.horizontal).toBe("right")
})
