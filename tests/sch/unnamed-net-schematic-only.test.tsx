import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"

test("schematic-only inputs keep implicit unnamed nets without new labels", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board>
      <resistor name="R1" resistance="1k" footprint="0603" />
      <capacitor name="C1" capacitance="100nF" footprint="0603" />
      <trace from=".R1 > .pin2" to=".C1 > .pin1" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const schematicOnly = circuit
    .getCircuitJson()
    .filter((element) => !element.type.startsWith("pcb_"))
  const schematic = new CircuitJsonToKicadSchConverter(schematicOnly)
  schematic.runUntilFinished()
  expect(schematic.ctx.kicadSch?.globalLabels).toHaveLength(0)
  expect(schematic.ctx.kicadSch?.wires).toHaveLength(1)
})
