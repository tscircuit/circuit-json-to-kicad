import { expect, test } from "bun:test"
import { render, expectNativeParity } from "../../fixtures/native-net-parity"

test("existing global label aliases join source groups before selecting the net name", async () => {
  const circuit = await render(
    <board width="30mm" height="20mm" routingDisabled>
      <schematicsheet name="First" displayName="First">
        <resistor name="R1" resistance="1k" footprint="0603" />
        <netlabel net="AAA" schX={-3} schY={2} connectsTo=".R1 > .pin1" />
        <netlabel
          net="FIRST_ZZZ"
          schX={-3}
          schY={-2}
          connectsTo=".R1 > .pin1"
        />
      </schematicsheet>
      <schematicsheet name="Second" displayName="Second">
        <resistor name="R2" resistance="1k" footprint="0603" />
        <netlabel
          net="SECOND_ZZZ"
          schX={-2}
          schY={2}
          connectsTo=".R2 > .pin1"
        />
      </schematicsheet>
    </board>,
  )
  // Imported global labels can alias independently identified source nets.
  for (const label of circuit.filter((e) => e.type === "schematic_net_label")) {
    if (label.text.endsWith("_ZZZ")) label.text = "ZZZ"
  }
  for (const input of [circuit, [...circuit].reverse()]) {
    const { native } = await expectNativeParity(input)
    expect(native).toContainEqual({ name: "AAA", pins: ["R1.1", "R2.1"] })
  }
}, 30_000)
