import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"

test("a drawing-only sheet does not report a grid-placement failure", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board>
      <schematicline x1={0} y1={0} x2={1} y2={0.5} />
    </board>,
  )
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadSchConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  expect(converter.ctx.schematicConnectionGrid).toBeDefined()
  expect(converter.getOutput().polylines).toHaveLength(1)
})
