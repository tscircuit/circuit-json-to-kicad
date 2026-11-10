import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { ConnectionGridBox } from "../fixtures/connection-grid-boxes"

test("rejects diagonal routing before exporting a partially moved circuit", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  // Exercise authored diagonal wires through core's direct-line router.
  circuit._featureMspSchematicTraceRouting = false
  circuit.add(
    <board routingDisabled>
      <chip
        name="U1"
        schX={-2}
        symbol={<ConnectionGridBox side="right" spacing={0.4} />}
      />
      <chip
        name="U2"
        schX={2}
        schY={1}
        symbol={<ConnectionGridBox side="left" spacing={0.4} />}
      />
      <trace from="U1.pin1" to="U2.pin1" />
    </board>,
  )
  circuit._getBoard()!.props._schDirectLineRoutingEnabled = true
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadSchConverter(circuit.getCircuitJson())
  expect(() => converter.runUntilFinished()).toThrow("diagonal schematic wires")
  expect(converter.ctx.schematicConnectionGrid).toBeUndefined()
})
