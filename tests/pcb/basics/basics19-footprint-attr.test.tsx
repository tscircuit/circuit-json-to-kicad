import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("pcb basics19 footprints emit KiCad attr by pad type", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={0} pcbY={0} />
      <chip name="J1" footprint="pinrow4" pcbX={8} pcbY={0} />
    </board>,
  )

  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const output = converter.getOutputString()

  const footprints = output.split(/\n\s*\(footprint\s/).slice(1)
  const smdFootprint = footprints.find((f) => f.includes("0402"))
  const thruHoleFootprint = footprints.find((f) => f.includes("pinrow"))

  expect(smdFootprint).toBeDefined()
  expect(smdFootprint).toContain("(attr smd)")
  expect(thruHoleFootprint).toBeDefined()
  expect(thruHoleFootprint).toContain("(attr through_hole)")
})
