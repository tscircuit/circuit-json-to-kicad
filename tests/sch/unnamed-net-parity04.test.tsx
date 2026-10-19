import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { getNativeNetParity } from "../fixtures/get-native-net-conflicts"

test("colliding imported display names do not short independent native nets", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="30mm" height="20mm">
      <resistor
        name="R1"
        resistance="1k"
        footprint="0603"
        pcbX={-8}
        pcbY={-3}
      />
      <capacitor
        name="C1"
        capacitance="100nF"
        footprint="0603"
        pcbX={-3}
        pcbY={-3}
      />
      <resistor name="R2" resistance="1k" footprint="0603" pcbX={3} pcbY={3} />
      <capacitor
        name="C2"
        capacitance="100nF"
        footprint="0603"
        pcbX={8}
        pcbY={3}
      />
      <trace from=".R1 > .pin2" to=".C1 > .pin1" />
      <trace from=".R2 > .pin2" to=".C2 > .pin1" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  // Importers may reuse presentation text; connectivity IDs remain distinct.
  for (const element of circuitJson) {
    if (element.type === "source_trace") {
      element.display_name = "shared-display-name"
      element.connected_source_port_ids = []
    }
  }
  const { conflicts, nets } = await getNativeNetParity(circuitJson)
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
