import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { parseKicadSch } from "kicadts"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

const Example = () => (
  <board width="10mm" height="10mm">
    <chip
      name="U1"
      symbol={
        <symbol>
          <schematicarc
            center={{ x: 0, y: 0 }}
            radius={1}
            startAngleDegrees={0}
            endAngleDegrees={180}
            strokeWidth={0.05}
          />
          <schematicline x1={-1} y1={0} x2={1} y2={0} strokeWidth={0.05} />
        </symbol>
      }
    />
    <chip
      name="U2"
      symbol={
        <symbol>
          <schematiccircle
            center={{ x: 0, y: 0 }}
            radius={1}
            isFilled={false}
          />
        </symbol>
      }
    />
    <chip
      name="U3"
      symbol={
        <symbol>
          <schematicpath
            strokeWidth={0.05}
            points={[
              { x: -1, y: -0.6 },
              { x: -0.3, y: 0.6 },
              { x: 0.4, y: -0.6 },
              { x: 1.1, y: 0.6 },
            ]}
          />
        </symbol>
      }
    />
  </board>
)

export default Example

test("repro15 custom symbol schematic graphics", async () => {
  const circuit = new Circuit()
  circuit.add(<Example />)
  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const kicadSchematic = parseKicadSch(converter.getOutputString())
  if (!kicadSchematic.libSymbols) {
    throw new Error("Expected generated KiCad library symbols")
  }

  expect(
    kicadSchematic.libSymbols.symbols.map(({ libraryId }) => libraryId),
  ).toEqual([
    "Custom:custom_chip_schematic_symbol_0",
    "Custom:custom_chip_schematic_symbol_1",
    "Custom:custom_chip_schematic_symbol_2",
  ])
  expect(kicadSchematic.symbols.map(({ libraryId }) => libraryId)).toEqual([
    "Custom:custom_chip_schematic_symbol_0",
    "Custom:custom_chip_schematic_symbol_1",
    "Custom:custom_chip_schematic_symbol_2",
  ])

  const drawingSubsymbol = converter
    .getOutput()
    .libSymbols?.symbols[0]?.subSymbols.find((symbol) =>
      symbol.libraryId?.endsWith("_0_1"),
    )
  expect(drawingSubsymbol?.arcs).toHaveLength(1)

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "sch",
  })

  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({
        circuitJson,
        outputType: "schematic",
      }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
