import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("intersecting cutouts stay clipped and only the isolated circle is emitted whole", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={20} height={10}>
      <cutout shape="circle" radius={1} pcbX={-5} />
      <cutout shape="circle" radius={1} pcbX={-4} />
      <cutout shape="circle" radius={1} pcbX={0} />
      <cutout shape="rect" width={1} height={2} pcbX={0.5} />
      <cutout shape="circle" radius={1} pcbX={5} />
      <cutout shape="circle" radius={1} pcbX={12} />
    </board>,
  )
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const pcb = converter.getOutput()
  expect(pcb.graphicCircles.map((circle) => circle.centerPoint)).toEqual([
    { x: 105, y: 100 },
  ])
  expect(pcb.graphicLines.length).toBeGreaterThan(4)
})
