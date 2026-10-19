import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit-latest"

test("unrelated trace annotations stay ordinary text", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm" routingDisabled schMaxTraceDistance={1}>
      <resistor name="R1" resistance="1k" footprint="0402" schX={-1.5} />
      <resistor name="R2" resistance="1k" footprint="0402" schX={1.5} />
      <trace from=".R1 > .pin2" to="net.SIGNAL" />
      <trace from=".R2 > .pin1" to="net.SIGNAL" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  for (const row of circuitJson) {
    if (row.type === "schematic_text") row.text = "Test point"
  }
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const schematic = converter.getOutput()

  expect(schematic.labels).toHaveLength(0)
  expect(schematic.globalLabels).toHaveLength(0)
  expect(
    schematic.texts.filter((text) => text.value === "Test point"),
  ).toHaveLength(2)
})
