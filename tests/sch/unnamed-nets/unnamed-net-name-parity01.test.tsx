import { expect, test } from "bun:test"
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadSchConverter,
} from "lib"
import { Circuit } from "tscircuit"

test("unnamed pin-to-pin nets have the same name in the schematic and PCB", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm">
      <resistor name="R1" resistance="1k" footprint="0603" pcbX={-3} pcbY={0} />
      <capacitor
        name="C1"
        capacitance="100nF"
        footprint="0603"
        pcbX={3}
        pcbY={0}
      />
      <trace from=".R1 > .pin2" to=".C1 > .pin1" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const sch = new CircuitJsonToKicadSchConverter(circuitJson)
  sch.runUntilFinished()
  const pcb = new CircuitJsonToKicadPcbConverter(circuitJson)
  pcb.runUntilFinished()

  const pcbNetNames = pcb
    .getOutput()
    .nets.map((net) => net.name)
    .filter((name) => name !== "")
  expect(pcbNetNames).toHaveLength(1)
  expect(pcbNetNames[0]).toMatch(/^[A-Za-z0-9_.+-]+$/)

  const schLabelNames = sch.getOutput().labels.map((label) => label.value)
  expect(schLabelNames).toEqual(pcbNetNames)

  // The label must sit on the net: at an endpoint of one of its wires.
  const [label] = sch.getOutput().labels
  const wireEndpoints = sch.getOutput().wires.flatMap((wire) => {
    const points = wire.points?.points ?? []
    return [points[0], points.at(-1)]
  })
  expect(
    wireEndpoints.some(
      (p) =>
        p &&
        Math.abs((p as any).x - label!.at!.x) < 1e-6 &&
        Math.abs((p as any).y - label!.at!.y) < 1e-6,
    ),
  ).toBe(true)
})
