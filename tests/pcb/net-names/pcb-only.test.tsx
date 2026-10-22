import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadPcbConverter } from "lib"
import physicalBalls from "../../fixtures/physical-bga-balls.circuit.json"

test("PCB-only inputs retain their supplied net names", async () => {
  const circuit = (physicalBalls as CircuitJson).filter(
    (e) => !e.type.startsWith("schematic_"),
  )
  const pcb = new CircuitJsonToKicadPcbConverter(circuit)
  pcb.runUntilFinished()
  expect(
    pcb
      .getOutput()
      .nets.map((net) => net.name)
      .sort(),
  ).toEqual(["", "DATA", "GND"])
})
