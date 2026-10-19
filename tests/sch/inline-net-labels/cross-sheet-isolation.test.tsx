import { expect, test } from "bun:test"
import { Circuit } from "tscircuit-latest"
import { exportNativeSchematicNets } from "../../fixtures/export-native-schematic-nets"

test("KiCad keeps same-named SIGNAL connections on different sheets separate", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm" routingDisabled>
      <schematicsheet name="First" displayName="First" />
      <schematicsheet name="Second" displayName="Second" />
      <group
        subcircuit
        name="First"
        schSheetName="First"
        schMaxTraceDistance={1}
      >
        <resistor name="R1" resistance="1k" footprint="0402" schX={-1.5} />
        <resistor name="R2" resistance="1k" footprint="0402" schX={1.5} />
        <trace from=".R1 > .pin2" to="net.SIGNAL" />
        <trace from=".R2 > .pin1" to="net.SIGNAL" />
      </group>
      <group
        subcircuit
        name="Second"
        schSheetName="Second"
        schMaxTraceDistance={1}
      >
        <resistor name="R3" resistance="1k" footprint="0402" schX={-1.5} />
        <resistor name="R4" resistance="1k" footprint="0402" schX={1.5} />
        <trace from=".R3 > .pin2" to="net.SIGNAL" />
        <trace from=".R4 > .pin1" to="net.SIGNAL" />
      </group>
    </board>,
  )
  await circuit.renderUntilSettled()
  const nets = await exportNativeSchematicNets(circuit.getCircuitJson())
  const signalNets = nets.filter((net) => net.name?.endsWith("SIGNAL"))

  // Global labels would incorrectly join all four pins into one connection.
  expect(signalNets).toEqual([
    { name: "/First/SIGNAL", pins: ["R1.2", "R2.1"] },
    { name: "/Second/SIGNAL", pins: ["R3.2", "R4.1"] },
  ])
}, 30_000)
