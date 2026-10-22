import { expect, test } from "bun:test"
import { render, expectNativeParity } from "../../fixtures/native-net-parity"

test("unnamed nets choose descriptive pin names and lexical R10 before R2", async () => {
  const circuit = await render(
    <board width="40mm" height="20mm" routingDisabled schMaxTraceDistance={100}>
      <chip
        name="U1"
        footprint="soic8"
        pinLabels={{ pin1: "X/Y", pin2: "X_Z" }}
        schX={-5}
      />
      <resistor name="R2" resistance="1k" footprint="0603" schX={-1} />
      <resistor name="R10" resistance="1k" footprint="0603" schX={3} />
      <capacitor name="C3" capacitance="100nF" footprint="0603" schX={6} />
      <trace from=".U1 > .pin1" to=".R2 > .pin1" />
      <trace from=".U1 > .pin1" to=".U1 > .pin2" />
      <trace from=".R2 > .pin2" to=".R10 > .pin1" />
      <trace from=".R10 > .pin2" to=".C3 > .pin1" />
    </board>,
  )
  const { native } = await expectNativeParity(circuit)
  // Names are compared in KiCad's escaped form: X_Z sorts before X{slash}Y.
  expect(native).toContainEqual({
    name: "Net-(U1-X_Z)",
    pins: ["R2.1", "U1.1", "U1.2"],
  })
  expect(native).toContainEqual({
    name: "Net-(R10-Pad1)",
    pins: ["R10.1", "R2.2"],
  })
}, 30_000)
