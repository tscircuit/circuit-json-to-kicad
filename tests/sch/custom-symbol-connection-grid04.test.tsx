import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { readSchematicErc } from "../fixtures/read-schematic-erc"
import { Circuit } from "tscircuit"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"

const stemLength = 0

test(`keeps circular artwork and attaches pins on all four sides with stem length ${stemLength}`, async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  const radius = 0.5 + stemLength
  circuit.add(
    <board>
      <chip
        name="U1"
        noConnect={["pin1", "pin2", "pin3", "pin4"]}
        schX={0.1234567}
        schY={0.2345678}
        symbol={
          <symbol name="Circle">
            <schematiccircle center={{ x: 0, y: 0 }} radius={0.5} />
            <port
              name="1"
              pinNumber={1}
              direction="right"
              schX={radius}
              schY={0}
              schStemLength={stemLength}
            />
            <port
              name="2"
              pinNumber={2}
              direction="left"
              schX={-radius}
              schY={0}
              schStemLength={stemLength}
            />
            <port
              name="3"
              pinNumber={3}
              direction="up"
              schX={0}
              schY={radius}
              schStemLength={stemLength}
            />
            <port
              name="4"
              pinNumber={4}
              direction="down"
              schX={0}
              schY={-radius}
              schStemLength={stemLength}
            />
          </symbol>
        }
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  expect(converter.ctx.schematicConnectionGrid).toBeDefined()
  const units = converter.getOutput().libSymbols!.symbols[0]!.subSymbols
  expect(units.flatMap((unit) => unit.circles)[0]!.getString()).toContain(
    "(radius 7.5)",
  )
  const pins = units.flatMap((unit) => unit.pins)
  expect(pins).toHaveLength(4)
  for (const pin of pins) {
    expect(Math.hypot(pin.at!.x, pin.at!.y) - pin.length!).toBeCloseTo(7.5, 4)
  }
  expect(
    (await readSchematicErc(converter.getOutputString())).filter(
      (type) => type !== "lib_symbol_issues",
    ),
  ).toEqual([])
  const snapshot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "sch",
  })
  await expect(
    snapshot.generatedFileContent["temp_file.png"]!,
  ).toMatchPngSnapshot(import.meta.path)
}, 30_000)
