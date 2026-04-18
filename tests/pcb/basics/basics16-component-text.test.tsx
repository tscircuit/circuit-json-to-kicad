import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("pcb writes resistor and capacitor footprint text fields", () => {
  const circuitJson = JSON.parse(
    readFileSync("tests/assets/simple-circuit.json", "utf8"),
  )

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()

  expect(output).toContain('(property "Reference" "R1"')
  expect(output).toContain('(property "Value" "1kΩ"')
  expect(output).toContain('(property "Reference" "C1"')
  expect(output).toContain('(property "Value" "1000pF"')
})

test("pcb writes manufacturer part numbers for simple_chip footprint text fields", () => {
  const circuitJson = JSON.parse(
    readFileSync("tests/assets/555-timer-circuit.json", "utf8"),
  )

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()

  expect(output).toContain('(property "Reference" "P1"')
  expect(output).toContain('(property "Value" "KF301_5_0_2P"')
  expect(output).toContain('(property "Reference" "U1"')
  expect(output).toContain('(property "Value" "NE555P"')
})
