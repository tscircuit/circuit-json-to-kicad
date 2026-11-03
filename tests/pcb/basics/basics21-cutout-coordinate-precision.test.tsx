import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("cutouts preserve features at KiCad's one-nanometer resolution", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="4mm" height="4mm">
      <cutout shape="rect" width="0.000001mm" height="1mm" pcbX="0.5000005mm" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()

  const edges = converter
    .getOutput()
    .graphicLines.filter((line) => line.layer?.names[0] === "Edge.Cuts")
  // Four board edges plus four slot edges: normalization must not erase the slot.
  expect(edges).toHaveLength(8)
  const slotEdges = edges.filter(
    (line) => line.start!.x > 100 && line.start!.x < 101,
  )
  expect(slotEdges).toHaveLength(4)
  const slotPoints = slotEdges.flatMap((line) => [line.start!, line.end!])
  expect(Math.min(...slotPoints.map((point) => point.x))).toBeCloseTo(100.5, 10)
  expect(Math.max(...slotPoints.map((point) => point.x))).toBeCloseTo(
    100.500001,
    10,
  )
  expect(Math.min(...slotPoints.map((point) => point.y))).toBeCloseTo(99.5, 10)
  expect(Math.max(...slotPoints.map((point) => point.y))).toBeCloseTo(100.5, 10)
})
