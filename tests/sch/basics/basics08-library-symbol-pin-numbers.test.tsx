import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"

test("sch basics08 library symbol pins keep circuit pin numbers", async () => {
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
            {[1, 2, 3, 4].map((n) => (
              <smtpad
                portHints={[String(n)]}
                pcbX={n < 3 ? -1 : 1}
                pcbY={n % 2 ? -1 : 1}
                width={0.8}
                height={0.8}
                shape="rect"
                layer="top"
              />
            ))}
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
  const output = converter.getOutputString()

  // Each pin definition pairs (name ...) with (number ...); for a
  // library-drawn symbol the numeric name IS the circuit pin number.
  const pairs = [
    ...output.matchAll(/\(name "(\d+)"[\s\S]*?\(number "(\d+)"/g),
  ].map((m) => ({ name: m[1], number: m[2] }))

  expect(pairs.length).toBeGreaterThanOrEqual(4)
  for (const pair of pairs) {
    expect(pair.number).toBe(pair.name)
  }
})
