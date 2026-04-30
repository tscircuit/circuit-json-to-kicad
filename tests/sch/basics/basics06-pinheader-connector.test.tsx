import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"

test("basics06 - pinheader and connector generate standard Connector_Generic lib_ids", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board>
      <pinheader name="J1" pinCount={5} />
      <pinheader name="J2" pinCount={3} gender="female" />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const output = converter.getOutputString()

  // Verify that the output contains standard Connector_Generic lib_ids
  // For a 5-pin male header: Connector_Generic:Conn_01x05_Pin
  expect(output).toContain("Connector_Generic:Conn_01x05_Pin")

  // For a 3-pin female header: Connector_Generic:Conn_01x03_Socket
  expect(output).toContain("Connector_Generic:Conn_01x03_Socket")

  // Should NOT contain the old-style non-standard lib_ids like "Device:J_pin_header"
  expect(output).not.toContain("Device:J_pin_header")
  expect(output).not.toContain("tscircuit:pinheader")

  // Verify the lib_symbols section has the connector symbols defined
  expect(output).toContain("lib_symbols")

  // Verify reference designators use "J" prefix
  expect(output).toContain('"Reference" "J')

  // Verify connector value labels
  expect(output).toContain("Conn_01x05")
  expect(output).toContain("Conn_01x03")
})
