import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { readSchematicErc } from "../fixtures/read-schematic-erc"

test("an already aligned chip keeps its origin, body, pins, and no-connect markers", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board routingDisabled>
      <chip
        name="U1"
        schX={0}
        schY={0}
        schWidth={3.24 / 15}
        schHeight={7.62 / 15}
        pinLabels={{ pin1: "A", pin2: "B" }}
        noConnect={["A", "B"]}
        schPinArrangement={{
          leftSide: { pins: ["A"], direction: "top-to-bottom" },
          rightSide: { pins: ["B"], direction: "top-to-bottom" },
        }}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson, {
    schematicSheets: [{ circuitOrigin: { x: 127, y: 101.6 } }],
  })
  converter.runUntilFinished()
  const schematic = converter.getOutput()
  expect(schematic.symbols[0]!.at!.x).toBe(127)
  expect(schematic.symbols[0]!.at!.y).toBe(101.6)
  const units = schematic.libSymbols!.symbols[0]!.subSymbols
  expect(
    units
      .flatMap((unit) => unit.pins)
      .map((pin) => [pin.at!.x, pin.at!.y, pin.length]),
  ).toEqual([
    [-7.62, 0, 6],
    [7.62, 0, 6],
  ])
  const body = units.flatMap((unit) => unit.polylines)[0]!.getString()
  expect(body).toContain("(xy -1.62 -3.81)")
  expect(body).toContain("(xy 1.62 3.81)")
  expect(
    schematic.noConnects.map((marker) => [marker.at!.x, marker.at!.y]),
  ).toEqual([
    [119.38, 101.6],
    [134.62, 101.6],
  ])
  const grid = converter.ctx.schematicConnectionGrid!
  for (const [original, placed] of [...grid.x, ...grid.y])
    expect(placed).toBe(original)
  expect(
    (await readSchematicErc(converter.getOutputString())).filter(
      (type) => type !== "lib_symbol_issues",
    ),
  ).toEqual([])
}, 30_000)
