import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit-latest"

test("text without a source trace stays graphical even when it matches a net name", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm" routingDisabled schMaxTraceDistance={1}>
      <resistor name="R1" resistance="1k" footprint="0402" schX={-1.5} />
      <resistor name="R2" resistance="1k" footprint="0402" schX={1.5} />
      <trace from=".R1 > .pin2" to="net.SIGNAL" />
      <trace from=".R2 > .pin1" to="net.SIGNAL" />
      <schematictext text="SIGNAL" schX={0} schY={1} />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  expect(
    circuitJson.filter(
      (row) => row.type === "schematic_text" && !row.source_trace_id,
    ),
  ).toHaveLength(1)
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const schematic = converter.getOutput()

  expect(schematic.labels.map((label) => label.value)).toEqual([
    "SIGNAL",
    "SIGNAL",
  ])
  expect(schematic.globalLabels).toHaveLength(0)
  expect(
    schematic.texts.filter((text) => text.value === "SIGNAL"),
  ).toHaveLength(1)
})
