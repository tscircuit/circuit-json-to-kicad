import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"

/**
 * Repro for issue #292: schematic wire / pin coordinates are emitted as raw
 * floats with representation noise (e.g. `-0.44999999999999996` instead of
 * `-0.45`). KiCad schematic connectivity is coordinate-based, so a pin emitted
 * at `-0.4499…` and a wire endpoint emitted at `-0.45` no longer coincide and
 * the wire reads as disconnected.
 *
 * This asserts every emitted (xy …) and (at …) coordinate is rounded to a
 * sane precision (<= 6 decimal places), which both removes the noise and keeps
 * pins and wires landing on the exact same value.
 */
test("repro14: schematic coordinates are emitted without floating-point noise", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board>
      <inductor
        name="L1"
        inductance="10uH"
        footprint="0805"
        schX={-2}
        schY={0}
        connections={{ pin1: "R1.pin1" }}
      />
      <resistor name="R1" resistance="1k" footprint="0402" schX={2} schY={0} />
    </board>,
  )

  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadSchConverter(circuit.getCircuitJson())
  converter.runUntilFinished()

  const out = converter.getOutputString()

  // Collect every numeric coordinate from (xy a b) and (at a b [rot]) tokens.
  const numbers: string[] = []
  for (const m of out.matchAll(/\((?:xy|at)\s+([-\d.\s]+?)\)/g)) {
    for (const tok of m[1].trim().split(/\s+/)) {
      if (/^-?\d+(\.\d+)?$/.test(tok)) numbers.push(tok)
    }
  }

  expect(numbers.length).toBeGreaterThan(0)

  const noisy = numbers.filter((n) => {
    const dec = n.split(".")[1]
    return dec !== undefined && dec.length > 6
  })

  expect(noisy).toEqual([])
})
