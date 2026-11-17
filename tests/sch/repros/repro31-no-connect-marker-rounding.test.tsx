import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"
import { readSchematicErc } from "../../fixtures/read-schematic-erc"

test("repro31: no-connect markers follow grid placement after parser rounding near a midpoint", async () => {
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
  // The parser-rounded endpoint now moves with its pin onto the connection grid.
  expect(
    schematic.noConnects.map((marker) => [marker.at?.x, marker.at?.y]),
  ).toEqual([[85.09, 100.33]])
  expect(
    (await readSchematicErc(converter.getOutputString())).filter(
      (type) => type !== "lib_symbol_issues",
    ),
  ).toEqual([])
})
