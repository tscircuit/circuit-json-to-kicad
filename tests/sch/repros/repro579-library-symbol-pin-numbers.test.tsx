import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"

test("repro579: library symbol pin numbers match circuit pin labels", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="20mm" height="20mm">
      <crystal
        name="X1"
        frequency="8MHz"
        loadCapacitance="20pF"
        pinVariant="four_pin"
        pcbX={0}
        pcbY={0}
        footprint={
          <footprint>
            <smtpad
              portHints={["1"]}
              pcbX={-1}
              pcbY={-1}
              width={0.8}
              height={0.8}
              shape="rect"
              layer="top"
            />
            <smtpad
              portHints={["2"]}
              pcbX={-1}
              pcbY={1}
              width={0.8}
              height={0.8}
              shape="rect"
              layer="top"
            />
            <smtpad
              portHints={["3"]}
              pcbX={1}
              pcbY={-1}
              width={0.8}
              height={0.8}
              shape="rect"
              layer="top"
            />
            <smtpad
              portHints={["4"]}
              pcbX={1}
              pcbY={1}
              width={0.8}
              height={0.8}
              shape="rect"
              layer="top"
            />
          </footprint>
        }
      />
      <net name="OSC_IN" />
      <net name="OSC_OUT" />
      <net name="GND" />
      <trace from="X1.pin1" to="net.OSC_IN" />
      <trace from="X1.pin3" to="net.OSC_OUT" />
      <trace from="X1.pin2" to="net.GND" />
      <trace from="X1.pin4" to="net.GND" />
    </board>,
  )

  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadSchConverter(circuit.getCircuitJson())
  converter.runUntilFinished()

  const pinMappings = Array.from(
    converter
      .getOutputString()
      .matchAll(
        /\(pin passive line[\s\S]*?\(name "([^"]+)"[\s\S]*?\(number "([^"]+)"/g,
      ),
    ([, name, number]) => [name, number],
  )

  expect(Object.fromEntries(pinMappings)).toEqual({
    "1": "1",
    "2": "2",
    "3": "3",
    "4": "4",
  })
})
