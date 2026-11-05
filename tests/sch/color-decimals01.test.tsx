import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { parseColor } from "lib/schematic/stages/utils/parseColor"

test("leading-dot color decimals survive schematic symbol export", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={20} height={20}>
      <chip
        name="U1"
        symbol={
          <symbol>
            <schematicpath
              points={[
                { x: -1, y: -1 },
                { x: 1, y: -1 },
                { x: 1, y: 1 },
                { x: -1, y: 1 },
                { x: -1, y: -1 },
              ]}
              isFilled
              fillColor="rgba(255, 0, 0, .5)"
            />
          </symbol>
        }
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadSchConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  expect(converter.getOutputString()).toContain("(color 255 0 0 0.5)")
  for (const [color, expected] of [
    ["rgba(255, 0, 0, .5)", { r: 255, g: 0, b: 0, a: 0.5 }],
    ["rgb(.5, .25, .75)", { r: 0.5, g: 0.25, b: 0.75, a: 1 }],
    ["rgba(1, 2, 3, .0)", { r: 1, g: 2, b: 3, a: 0 }],
    ["rgba(1, 2, 3, 0.5)", { r: 1, g: 2, b: 3, a: 0.5 }],
    ["#1234", { r: 17, g: 34, b: 51, a: 68 / 255 }],
  ] as const)
    expect(parseColor(color)).toEqual(expected)
  for (const invalid of [
    "rgba(1, 2, 3, .)",
    "rgb(..5, 2, 3)",
    "rgba(1, 2, 3, 0..5)",
  ]) {
    expect(parseColor(invalid)).toBeUndefined()
  }
})
