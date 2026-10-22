import { expect, test } from "bun:test"
import { render, expectNativeParity } from "../../fixtures/native-net-parity"

test("a global label joins matching local labels on its own sheet", async () => {
  const circuit = await render(
    <board width="30mm" height="20mm" routingDisabled>
      <schematicsheet name="First" displayName="First">
        <group subcircuit name="FirstCircuit" schMaxTraceDistance={1}>
          <resistor name="R1" resistance="1k" footprint="0603" schX={-2} />
          <resistor name="R2" resistance="1k" footprint="0603" schX={2} />
          <resistor
            name="R3"
            resistance="1k"
            footprint="0603"
            schX={-2}
            schY={4}
          />
          <trace name="SIGNAL" from=".R1 > .pin2" to=".R2 > .pin1" />
          <netlabel net="NAMED" schX={-4} schY={5} connectsTo=".R3 > .pin1" />
        </group>
      </schematicsheet>
      <schematicsheet name="Child" displayName="Child">
        <group subcircuit name="ChildCircuit" schMaxTraceDistance={1}>
          <resistor name="R4" resistance="1k" footprint="0603" schX={-2} />
          <resistor name="R5" resistance="1k" footprint="0603" schX={2} />
          <trace name="CHILD_SIGNAL" from=".R4 > .pin2" to=".R5 > .pin1" />
        </group>
      </schematicsheet>
    </board>,
  )
  for (const label of circuit.filter((e) => e.type === "schematic_net_label"))
    label.text = "SIGNAL"
  for (const text of circuit.filter((e) => e.type === "schematic_text")) {
    if (text.source_trace_id) text.text = "SIGNAL"
  }
  const { native } = await expectNativeParity(circuit)
  expect(native).toContainEqual({
    name: "SIGNAL",
    pins: ["R1.2", "R2.1", "R3.1"],
  })
  expect(native).toContainEqual({
    name: "/Child/SIGNAL",
    pins: ["R4.2", "R5.1"],
  })
}, 30_000)
