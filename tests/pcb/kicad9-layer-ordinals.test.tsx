import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("pcb layer ordinals follow the KiCad 9 numbering", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="10mm" layers={4} routingDisabled>
      <resistor name="R1" resistance="1k" footprint="0402" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const output = converter.getOutputString()

  expect(output).toContain("(version 20241229)")
  for (const [ordinal, name] of [
    [0, "F.Cu"],
    [4, "In1.Cu"],
    [6, "In2.Cu"],
    [2, "B.Cu"],
    [1, "F.Mask"],
    [3, "B.Mask"],
    [5, "F.SilkS"],
    [7, "B.SilkS"],
    [13, "F.Paste"],
    [15, "B.Paste"],
    [25, "Edge.Cuts"],
    [31, "F.CrtYd"],
    [35, "F.Fab"],
  ] as const) {
    expect(output).toContain(`(${ordinal} "${name}"`)
  }
})
