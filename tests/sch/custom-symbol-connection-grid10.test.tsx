import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { readSchematicErc } from "../fixtures/read-schematic-erc"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"

test("a pin in the missing half of an arc remains unattached to its artwork", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board routingDisabled>
      <chip
        name="U1"
        noConnect={["pin1"]}
        symbol={
          <symbol name="DecorativeArc">
            <schematicarc
              center={{ x: 0, y: 0 }}
              radius={0.5}
              startAngleDegrees={0}
              endAngleDegrees={180}
            />
            <port
              name="1"
              pinNumber={1}
              direction="down"
              schX={0}
              schY={-0.5}
            />
          </symbol>
        }
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadSchConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const units = converter.getOutput().libSymbols!.symbols[0]!.subSymbols
  expect(units.flatMap((unit) => unit.arcs)).toHaveLength(1)
  expect(units.flatMap((unit) => unit.pins)[0]!.length).toBe(0.01)
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
