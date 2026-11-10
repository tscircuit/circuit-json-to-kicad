import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { exportNativeSchematicNets } from "../fixtures/export-native-schematic-nets"
import { readSchematicErc } from "../fixtures/read-schematic-erc"

test("built-in resistor/capacitor networks keep their separate nets and inline labels", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board routingDisabled>
      <resistor
        name="R1"
        pinAttributes={{ pin1: { doNotConnect: true } }}
        resistance="1k"
        schX={-2}
        schY={1}
      />
      <capacitor
        name="C1"
        pinAttributes={{ pin2: { doNotConnect: true } }}
        capacitance="100nF"
        schX={2}
        schY={1}
      />
      <resistor
        name="R2"
        pinAttributes={{ pin1: { doNotConnect: true } }}
        resistance="2k"
        schX={-2}
        schY={-1}
      />
      <capacitor
        name="C2"
        pinAttributes={{ pin2: { doNotConnect: true } }}
        capacitance="1uF"
        schX={2}
        schY={-1}
      />
      <trace name="A" from=".R1 > .pin2" to=".C1 > .pin1" />
      <trace name="B" from=".R2 > .pin2" to=".C2 > .pin1" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  expect(converter.ctx.schematicConnectionGrid).toBeDefined()
  expect(
    (await readSchematicErc(converter.getOutputString())).filter(
      (type) => type !== "lib_symbol_issues",
    ),
  ).toEqual([])
  expect(
    (await exportNativeSchematicNets(circuitJson)).filter(
      (net) => net.pins.length > 1,
    ),
  ).toEqual([
    { name: "/A", pins: ["C1.1", "R1.2"] },
    { name: "/B", pins: ["C2.1", "R2.2"] },
  ])
}, 30_000)
