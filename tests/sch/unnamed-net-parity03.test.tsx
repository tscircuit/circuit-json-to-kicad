import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { getNativeNetParity } from "../fixtures/get-native-net-conflicts"

test("generated names agree across child sheets without joining unrelated nets", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="30mm" height="20mm">
      <group subcircuit name="Left" schSheetName="Left">
        <resistor
          name="R1"
          resistance="1k"
          footprint="0603"
          pcbX={-8}
          pcbY={0}
        />
        <capacitor
          name="C1"
          capacitance="100nF"
          footprint="0603"
          pcbX={-3}
          pcbY={0}
        />
        <trace from=".R1 > .pin2" to=".C1 > .pin1" />
      </group>
      <group subcircuit name="Right" schSheetName="Right">
        <resistor
          name="R2"
          resistance="1k"
          footprint="0603"
          pcbX={3}
          pcbY={0}
        />
        <capacitor
          name="C2"
          capacitance="100nF"
          footprint="0603"
          pcbX={8}
          pcbY={0}
        />
        <trace from=".R2 > .pin2" to=".C2 > .pin1" />
      </group>
    </board>,
  )
  await circuit.renderUntilSettled()
  const { conflicts, nets } = await getNativeNetParity(circuit.getCircuitJson())
  expect(conflicts).toEqual([])
  expect(nets.find((net) => net.pins.includes("R1.2"))?.pins).toEqual([
    "C1.1",
    "R1.2",
  ])
  expect(nets.find((net) => net.pins.includes("R2.2"))?.pins).toEqual([
    "C2.1",
    "R2.2",
  ])
}, 30_000)
