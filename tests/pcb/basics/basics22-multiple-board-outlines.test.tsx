import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("exports every standalone board outline when there is no panel", async () => {
  const circuit = new Circuit()
  circuit.add(<board width="10mm" height="12mm" pcbX={-10} />)
  circuit.add(
    <board
      outline={[
        { x: 6, y: -3 },
        { x: 14, y: -3 },
        { x: 10, y: 3 },
      ]}
    />,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  expect(circuitJson.filter((e) => e.type === "pcb_board")).toHaveLength(2)
  expect(circuitJson.filter((e) => e.type === "pcb_panel")).toHaveLength(0)

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const edges = converter
    .getOutput()
    .graphicLines.filter((line) => line.layer?.names[0] === "Edge.Cuts")
  expect(edges).toHaveLength(7)
  const points = edges.flatMap((line) => [
    { x: line.start!.x - 100, y: 100 - line.start!.y },
    { x: line.end!.x - 100, y: 100 - line.end!.y },
  ])
  for (const point of [
    { x: -15, y: -6 },
    { x: -5, y: -6 },
    { x: -5, y: 6 },
    { x: -15, y: 6 },
    { x: 6, y: -3 },
    { x: 14, y: -3 },
    { x: 10, y: 3 },
  ]) {
    expect(
      points.filter((p) => p.x === point.x && p.y === point.y),
    ).toHaveLength(2)
  }
})
