import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"

test("basics01", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board>
      <resistor name="R1" resistance="1k" footprint="0402" />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()

  // TODO convert into KicadSch
})
