import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"

/**
 * Regression test for issues #283 and #292:
 * Schematic wires disconnected from component pins due to floating-point
 * precision issues in coordinate calculations.
 *
 * After the c2kMatSch matrix transformation, coordinates can accumulate
 * floating-point errors (e.g., 10.1599999 instead of 10.16), causing
 * wires to appear visually connected but electrically disconnected in KiCad.
 *
 * Fix: round wire endpoint coordinates to 4 decimal places in
 * AddSchematicTracesStage.ts.
 */
test("repro11: schematic wire endpoints have at most 4 decimal places (no floating-point drift)", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board>
      <inductor
        name="L1"
        inductance="10uH"
        footprint="0402"
        schX={-3}
        schY={0}
        connections={{ pin1: "R1.pin1" }}
      />
      <resistor name="R1" resistance="100" footprint="0402" schX={3} schY={0} />
    </board>,
  )

  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadSchConverter(circuit.getCircuitJson())
  converter.runUntilFinished()

  const kicadSchOutput = converter.getOutputString()

  // Extract all (xy ...) coordinate values from wire blocks
  const wireBlocks = kicadSchOutput.match(/\(wire[\s\S]*?\n  \)/g) ?? []
  expect(wireBlocks.length).toBeGreaterThan(0)

  const xyPattern = /\(xy ([\d.eE+-]+) ([\d.eE+-]+)\)/g
  const allCoords: number[] = []
  for (const block of wireBlocks) {
    let m: RegExpExecArray | null
    while ((m = xyPattern.exec(block)) !== null) {
      allCoords.push(Number(m[1]), Number(m[2]))
    }
  }

  expect(allCoords.length).toBeGreaterThan(0)

  // Each coordinate should have at most 4 decimal places — no drift like 10.1599999
  for (const coord of allCoords) {
    const str = coord.toString()
    const dotIndex = str.indexOf(".")
    if (dotIndex !== -1) {
      const decimals = str.length - dotIndex - 1
      expect(
        decimals,
        `Coordinate ${coord} has ${decimals} decimal places (expected ≤ 4)`,
      ).toBeLessThanOrEqual(4)
    }
  }
})
