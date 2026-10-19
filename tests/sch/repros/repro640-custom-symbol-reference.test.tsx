import { expect, test } from "bun:test"
import type { SchematicText } from "circuit-json"
import { CircuitJsonToKicadSchConverter } from "lib"
import { parseKicadSch } from "kicadts"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

const MySymbol = () => (
  <symbol name="MySym" width={2} height={1}>
    <schematicrect schX={0} schY={0} width={1} height={0.6} />
    <schematictext
      text="{REF}"
      schX={0}
      schY={0}
      anchor="center"
      fontSize={0.2}
    />
    <port name="1" pinNumber={1} direction="right" schX={0.5} schY={0} />
  </symbol>
)

const Example = () => (
  <board width="10mm" height="10mm">
    <chip
      name="U1"
      pcbX={-2}
      schX={-2}
      symbol={<MySymbol />}
      footprint="0402"
    />
    <chip name="U2" pcbX={2} schX={2} symbol={<MySymbol />} footprint="0402" />
  </board>
)

export default Example

test("repro640: shared custom symbol reference text", async () => {
  const circuit = new Circuit()
  circuit.add(<Example />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  expect(
    circuitJson
      .filter(
        (element): element is SchematicText =>
          element.type === "schematic_text" &&
          Boolean(element.schematic_symbol_id),
      )
      .map((element) => element.text),
  ).toEqual(["U1", "U2"])

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const schematic = parseKicadSch(output)
  // The tscircuit version pinned here fits the two resized instances
  // differently (rect widths 0.65 and 0.95), so each gets its own definition
  // (#663). Current tscircuit draws them alike and they share "Custom:MySym".
  expect(
    schematic.libSymbols?.symbols.map((symbol) => symbol.libraryId),
  ).toEqual(["Custom:MySym", "Custom:MySym_2"])
  expect(schematic.symbols.map((symbol) => symbol.libraryId)).toEqual([
    "Custom:MySym",
    "Custom:MySym_2",
  ])

  // References belong to the placed instances, not the shared drawing.
  const libraryTexts = schematic.libSymbols?.symbols.flatMap((symbol) =>
    symbol.subSymbols.flatMap((drawing) =>
      drawing.texts.map((text) => text.value),
    ),
  )
  expect(libraryTexts).toEqual([])
  const references = schematic.symbols.map(
    (symbol) =>
      symbol.properties.find((property) => property.key === "Reference")!,
  )
  expect(references.map((property) => property.value)).toEqual(["U1", "U2"])
  expect(references.every((property) => !property.effects?.hiddenText)).toBe(
    true,
  )

  const snapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
    includeSvg: true,
  })
  // Verify the native fields are actually rendered once for each instance.
  const svg = snapshot.generatedFileContent["temp_file.svg"]!.toString()
  expect(svg.match(/>U1<\/text>/g)).toHaveLength(1)
  expect(svg.match(/>U2<\/text>/g)).toHaveLength(1)
  expect(svg).not.toContain("${REFERENCE}")

  await expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "schematic" }),
      snapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
