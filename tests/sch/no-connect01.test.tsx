import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"

test("preserves each instance's intentional NC pins without marking other open pins", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={30} height={20} routingDisabled>
      {[
        { name: "U1", x: -2, noConnect: ["NC"] },
        { name: "U2", x: 2, noConnect: ["OUT"] },
      ].map(({ name, x, noConnect }) => (
        <chip
          key={name}
          name={name}
          footprint="soic8"
          schX={x}
          pinLabels={{ pin1: "IN", pin2: "NC", pin3: "OUT", pin4: "GND" }}
          schPinArrangement={{
            leftSide: { pins: [1, 2], direction: "top-to-bottom" },
            rightSide: { pins: [3, 4], direction: "top-to-bottom" },
          }}
          noConnect={noConnect}
        />
      ))}
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const originalJson = JSON.stringify(circuitJson)
  expect(
    circuitJson.filter(
      (element) => element.type === "source_port" && element.do_not_connect,
    ),
  ).toHaveLength(2)

  const converter = new CircuitJsonToKicadSchConverter(circuitJson, {
    schematicSheets: [{ circuitOrigin: { x: 100, y: 100 } }],
  })
  converter.runUntilFinished()
  const output = parseKicadSch(converter.getOutputString())

  expect(output.symbols).toHaveLength(2)
  expect(
    output.noConnects.map((marker) => [marker.at!.x, marker.at!.y]),
  ).toEqual([
    [53.5, 101.5],
    [146.5, 98.5],
  ])
  expect(
    new Set(output.noConnects.map((marker) => marker.uuid!.value)).size,
  ).toBe(2)
  expect(JSON.stringify(circuitJson)).toBe(originalJson)
})
