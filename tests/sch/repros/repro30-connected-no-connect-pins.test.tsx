import { expect, test } from "bun:test"
import type { SchematicPort, SourcePort } from "circuit-json"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"

test("repro30: connected pins do not emit KiCad no-connect markers", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board routingDisabled>
      <chip name="U1" pinLabels={{ pin1: "NC" }} noConnect={["NC"]} />
      <net name="CONNECTED" />
      <trace from="U1.NC" to="net.CONNECTED" />
    </board>,
  )
  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const sourcePort = circuitJson.find(
    (element): element is SourcePort =>
      element.type === "source_port" && element.name === "NC",
  )
  if (!sourcePort) throw new Error("Expected NC source port")
  expect(sourcePort.do_not_connect).toBe(true)

  const schematicPort = circuitJson.find(
    (element): element is SchematicPort =>
      element.type === "schematic_port" &&
      element.source_port_id === sourcePort.source_port_id,
  )
  if (!schematicPort) throw new Error("Expected NC schematic port")
  expect(schematicPort.is_connected).toBe(true)

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  expect(parseKicadSch(converter.getOutputString()).noConnects).toHaveLength(0)
})
