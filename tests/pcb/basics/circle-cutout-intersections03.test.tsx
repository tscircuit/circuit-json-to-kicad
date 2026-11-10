import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

test("a circle stays native when a rectangle only overlaps its bounding box", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={10} height={10}>
      <cutout shape="circle" radius={1} />
      <cutout shape="rect" width={0.2} height={0.2} pcbX={0.9} pcbY={0.9} />
    </board>,
  )
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const pcb = converter.getOutput()
  expect({
    circles: pcb.graphicCircles.map((circle) => circle.centerPoint),
    lines: pcb.graphicLines.length,
  }).toEqual({ circles: [{ x: 100, y: 100 }], lines: 8 })
})
