import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"

test("repro31: no-connect markers preserve parser rounding near a midpoint", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board routingDisabled>
      <chip
        name="U1"
        schY={0.00007}
        pinLabels={{ pin1: "NC" }}
        noConnect={["NC"]}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadSchConverter(
    circuit.getCircuitJson(),
    {
      schematicSheets: [{ circuitOrigin: { x: 100, y: 100 } }],
    },
  )
  converter.runUntilFinished()
  const schematic = parseKicadSch(converter.getOutputString())
  expect(
    schematic.noConnects.map((marker) => [marker.at?.x, marker.at?.y]),
  ).toEqual([[84.25, 99.9989]])
})
