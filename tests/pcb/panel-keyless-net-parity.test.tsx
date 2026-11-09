import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { getNativeNetParity } from "../fixtures/get-native-net-conflicts"

test("panel keyless networks preserve schematic parity", async () => {
  const circuit = new Circuit()
  circuit.add(
    <panel layoutMode="grid" row={1} col={2} boardGap="2mm">
      <board width="15mm" height="15mm">
        <resistor
          name="R1"
          schX={-10}
          resistance="1k"
          footprint="0402"
          pcbX={-2}
        />
        <capacitor
          name="C1"
          schX={-5}
          capacitance="100nF"
          footprint="0402"
          pcbX={2}
        />
        <trace from=".R1 > .pin2" to=".C1 > .pin1" />
      </board>
      <board width="15mm" height="15mm">
        <resistor
          name="R2"
          schX={5}
          resistance="1k"
          footprint="0402"
          pcbX={-2}
        />
        <capacitor
          name="C2"
          schX={10}
          capacitance="100nF"
          footprint="0402"
          pcbX={2}
        />
        <trace from=".R2 > .pin2" to=".C2 > .pin1" />
      </board>
    </panel>,
  )
  await circuit.renderUntilSettled()
  const json = circuit.getCircuitJson()
  for (const item of json)
    if ("subcircuit_connectivity_map_key" in item)
      delete item.subcircuit_connectivity_map_key
  const parity = await getNativeNetParity(json)
  expect(parity.conflicts).toEqual([])
  expect(parity.nets).toEqual([
    { name: "pcb_board_0/Net-(R1-Pad2)", pins: ["C1.1", "R1.2"] },
    { name: "pcb_board_1/Net-(R2-Pad2)", pins: ["C2.1", "R2.2"] },
    { name: "unconnected-(C1-Pad2)", pins: ["C1.2"] },
    { name: "unconnected-(C2-Pad2)", pins: ["C2.2"] },
    { name: "unconnected-(R1-Pad1)", pins: ["R1.1"] },
    { name: "unconnected-(R2-Pad1)", pins: ["R2.1"] },
  ])
}, 120000)
