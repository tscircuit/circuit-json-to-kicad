import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

const MySymbol = () => (
  <symbol name="MyPart">
    <schematicpath
      strokeWidth={0.05}
      points={[
        { x: -0.374283, y: -0.07219 },
        { x: 0.374283, y: -0.07219 },
        { x: 0.374283, y: 0.07219 },
        { x: -0.374283, y: 0.07219 },
        { x: -0.374283, y: -0.07219 },
      ]}
    />
    <port name="1" pinNumber={1} direction="right" schX={0.374283} schY={0} />
  </symbol>
)

const Example = () => (
  <board width="20mm" height="10mm">
    <chip
      name="U1"
      footprint="0402"
      symbol={<MySymbol />}
      pcbX={-3}
      schX={0}
      schY={0}
    />
    <chip
      name="U2"
      footprint="0402"
      symbol={<MySymbol />}
      pcbX={3}
      schX={2.205}
      schY={-2.55}
    />
  </board>
)

export default Example

test("repro877: identical custom symbols at a coordinate rounding boundary", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(<Example />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const schematic = parseKicadSch(output)

  // Capture the duplicate IDs and the one-unit drawing difference from #877.
  expect({
    instanceLibraryIds: schematic.symbols.map((symbol) => symbol.libraryId),
    libraryDrawings: schematic.libSymbols!.symbols.map((symbol) => ({
      libraryId: symbol.libraryId,
      polylines: symbol.subSymbols.flatMap((unit) =>
        unit.polylines.map((polyline) => polyline.getString()),
      ),
    })),
  }).toMatchSnapshot()

  const snapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
  })
  expect(snapshot.exitCode).toBe(0)
  await expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "schematic" }),
      snapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 30_000)
