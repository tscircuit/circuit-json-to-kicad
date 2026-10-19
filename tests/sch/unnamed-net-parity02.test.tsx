import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { getNativeNetParity } from "../fixtures/get-native-net-conflicts"

test("chip pin names, named nets and multiple unnamed nets retain native connectivity", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="35mm" height="25mm">
      <chip
        name="U1"
        footprint="soic8"
        pcbX={0}
        pcbY={0}
        pinLabels={{ pin1: "FB", pin2: "VIN", pin3: "GND" }}
      />
      <resistor
        name="R1"
        resistance="10k"
        footprint="0603"
        pcbX={-8}
        pcbY={0}
      />
      <resistor name="R2" resistance="1k" footprint="0603" pcbX={8} pcbY={0} />
      <capacitor
        name="C1"
        capacitance="100nF"
        footprint="0603"
        pcbX={0}
        pcbY={7}
      />
      <trace from=".U1 > .FB" to=".R1 > .pin1" />
      <trace from=".R1 > .pin2" to=".C1 > .pin1" />
      <trace from=".C1 > .pin2" to=".R2 > .pin1" />
      <trace from=".U1 > .GND" to="net.GND" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const { conflicts, nets } = await getNativeNetParity(circuit.getCircuitJson())
  expect(conflicts).toEqual([])
  expect(nets.find((net) => net.name === "GND")?.pins).toContain("U1.3")
  expect(nets.find((net) => net.pins.includes("U1.1"))?.pins).toEqual([
    "R1.1",
    "U1.1",
  ])
}, 30_000)
