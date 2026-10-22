import { expect, test } from "bun:test"
import { render, expectNativeParity } from "../../fixtures/native-net-parity"

test("fanout uses one net for several source traces and is input-order independent", async () => {
  const circuit = await render(
    <board width="30mm" height="20mm" routingDisabled>
      <schematicsheet name="Child" displayName="Child">
        <resistor name="R1" resistance="1k" footprint="0603" schX={-3} />
        <resistor name="R2" resistance="1k" footprint="0603" schX={3} />
        <capacitor name="C1" capacitance="1uF" footprint="0603" schY={3} />
        <trace from=".R1 > .pin2" to=".R2 > .pin1" />
        <trace from=".R1 > .pin2" to=".C1 > .pin1" />
      </schematicsheet>
    </board>,
  )
  const first = await expectNativeParity(circuit)
  const reversed = await expectNativeParity([...circuit].reverse())
  expect(first.native).toEqual(reversed.native)
  expect(first.native).toContainEqual({
    name: "Net-(C1-Pad1)",
    pins: ["C1.1", "R1.2", "R2.1"],
  })
}, 30_000)
