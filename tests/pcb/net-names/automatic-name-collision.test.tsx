import { expect, test } from "bun:test"
import { render, expectNativeParity } from "../../fixtures/native-net-parity"

test("an explicit global label wins a collision with an automatic name", async () => {
  const circuit = await render(
    <board width="30mm" height="20mm" routingDisabled schMaxTraceDistance={100}>
      <resistor name="R1" resistance="1k" footprint="0603" schX={-3} />
      <capacitor name="C1" capacitance="1uF" footprint="0603" schX={1} />
      <resistor name="R2" resistance="1k" footprint="0603" schX={-3} schY={4} />
      <trace from=".R1 > .pin2" to=".C1 > .pin1" />
      <netlabel net="NAMED" schX={0} schY={4} connectsTo=".R2 > .pin2" />
    </board>,
  )
  // An imported explicit label is allowed to resemble KiCad's automatic names.
  for (const label of circuit.filter((e) => e.type === "schematic_net_label")) {
    label.text = "Net-(C1-Pad1)"
  }
  const { native } = await expectNativeParity(circuit)
  expect(native).toContainEqual({
    name: "Net-(C1-Pad1)_1",
    pins: ["C1.1", "R1.2"],
  })
  expect(native).toContainEqual({ name: "Net-(C1-Pad1)", pins: ["R2.2"] })
}, 30_000)
