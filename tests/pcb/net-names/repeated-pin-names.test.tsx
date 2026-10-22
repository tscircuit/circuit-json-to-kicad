import { test } from "bun:test"
import { render, expectNativeParity } from "../../fixtures/native-net-parity"

test("duplicate pin names remain distinct and include their pad number", async () => {
  const circuit = await render(
    <board width="30mm" height="20mm" routingDisabled>
      <chip
        name="U1"
        footprint="soic8"
        pinLabels={{ pin1: "FIRST", pin2: "SECOND" }}
        schX={-3}
      />
      <resistor name="R1" resistance="1k" footprint="0603" schX={2} schY={2} />
      <resistor name="R2" resistance="1k" footprint="0603" schX={2} schY={-2} />
      <trace from=".U1 > .pin1" to=".R1 > .pin1" />
      <trace from=".U1 > .pin2" to=".R2 > .pin1" />
    </board>,
  )
  // Imported symbols can name distinct pins alike without internally joining
  // them. Change only their displayed names, preserving the two source nets.
  for (const port of circuit.filter((e) => e.type === "schematic_port")) {
    if (["FIRST", "SECOND"].includes(port.display_pin_label ?? "")) {
      port.display_pin_label = "IO"
    }
  }
  await expectNativeParity(circuit)
}, 30_000)
