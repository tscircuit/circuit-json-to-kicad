import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

test("pcb basics19 bottom component footprint layer", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="10mm">
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-2} />
      <capacitor
        name="C1"
        capacitance="100nF"
        footprint="0603"
        layer="bottom"
        pcbX={2}
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()

  const footprints = converter.getOutput().footprints
  expect(footprints).toHaveLength(2)
  expect(footprints[0]?.layer?.getString()).toBe("(layer F.Cu)")
  expect(footprints[1]?.layer?.getString()).toBe("(layer B.Cu)")
})
