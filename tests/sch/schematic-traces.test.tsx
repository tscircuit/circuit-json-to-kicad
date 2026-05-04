import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"

test("schematic traces export with explicit wire stroke width", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board>
      <resistor
        name="R1"
        resistance="4.7k"
        footprint="0402"
        schX={-2}
        schY={0}
        connections={{ pin1: "R2.pin1" }}
      />
      <resistor
        name="R2"
        resistance="4.7k"
        footprint="0402"
        schX={2}
        schY={0}
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadSchConverter(circuit.getCircuitJson())
  converter.runUntilFinished()

  const kicadSchOutput = converter.getOutputString()
  const wireBlocks = kicadSchOutput.match(/\(wire[\s\S]*?\n  \)/g) ?? []

  expect(wireBlocks.length).toBeGreaterThan(0)
  expect(wireBlocks.every((wire) => wire.includes("(width 0.254)"))).toBe(true)
  expect(wireBlocks.some((wire) => wire.includes("(width 0)"))).toBe(false)
})
