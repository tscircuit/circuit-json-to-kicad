import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

test("a circle clear of the sloped edges of a diamond board stays native", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board
      outline={[
        { x: 0, y: 1.8 },
        { x: 1.8, y: 0 },
        { x: 0, y: -1.8 },
        { x: -1.8, y: 0 },
      ]}
    >
      <cutout shape="circle" radius={1} />
    </board>,
  )
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const pcb = converter.getOutput()
  expect({
    circles: pcb.graphicCircles.map((circle) => circle.centerPoint),
    lines: pcb.graphicLines.length,
  }).toEqual({ circles: [{ x: 100, y: 100 }], lines: 4 })
})
