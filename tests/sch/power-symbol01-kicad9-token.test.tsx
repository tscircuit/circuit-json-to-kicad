import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"

// The schematic header declares the KiCad 9 file format (20250114). KiCad 9's
// parser only accepts a bare `(power)` token; `(power global)` is KiCad 10
// syntax and makes KiCad 9 reject the whole file. A bare `(power)` is still
// a global power symbol in KiCad 10.
test("power symbols use the KiCad 9 compatible (power) token", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board>
      <resistor
        name="R1"
        resistance="1k"
        footprint="0402"
        connections={{ pin1: "net.VCC", pin2: "net.GND" }}
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadSchConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const kicadSchematicText = converter.getOutputString()

  expect(kicadSchematicText).toContain("(version 20250114)")
  expect(kicadSchematicText).toMatch(/\(power\)/)
  expect(kicadSchematicText).not.toContain("(power global)")
})
