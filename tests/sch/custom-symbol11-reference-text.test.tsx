import { expect, test } from "bun:test"
import type { SchematicText } from "circuit-json"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"

const LabeledSymbol = () => (
  <symbol name="LabeledSymbol" width={3} height={2}>
    <schematicrect width={3} height={2} strokeWidth={0.05} />
    <schematictext text="{REF}" schX={0.5} schY={0.5} fontSize={0.3} />
    <schematictext text="U7 supply" schY={-0.3} fontSize={0.2} />
    <schematictext text="+" schX={-1} schY={0.5} fontSize={0.2} />
  </symbol>
)

const Example = () => (
  <board width="15mm" height="10mm">
    <chip
      name="U7"
      pcbX={-3}
      schX={-3}
      symbol={<LabeledSymbol />}
      footprint="0402"
    />
    <chip
      name="U8"
      pcbX={3}
      schX={3}
      symbol={<LabeledSymbol />}
      footprint="0402"
    />
  </board>
)

export default Example

test("custom-symbol11: reference text resolves per instance and literal text is preserved", async () => {
  const circuit = new Circuit()
  circuit.add(<Example />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const sourceTexts = circuitJson.filter(
    (element): element is SchematicText =>
      element.type === "schematic_text" && Boolean(element.schematic_symbol_id),
  )
  const originalTexts = structuredClone(sourceTexts)

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const schematic = parseKicadSch(output)
  expect(schematic.libSymbols?.symbols).toHaveLength(1)
  const libraryTexts = schematic.libSymbols?.symbols.flatMap((symbol) =>
    symbol.subSymbols.flatMap((drawing) =>
      drawing.texts.map((text) => text.value),
    ),
  )
  expect(libraryTexts).toEqual(["${REFERENCE}", "U7 supply", "+"])
  expect(sourceTexts).toEqual(originalTexts)
  expect(
    schematic.symbols.map(
      (symbol) =>
        symbol.properties.find((property) => property.key === "Reference")
          ?.value,
    ),
  ).toEqual(["U7", "U8"])

  const snapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
    includeSvg: true,
  })
  const svg = snapshot.generatedFileContent["temp_file.svg"]!.toString()
  expect(svg.match(/>U7<\/text>/g)).toHaveLength(1)
  expect(svg.match(/>U8<\/text>/g)).toHaveLength(1)
  expect(svg.match(/>U7 supply<\/text>/g)).toHaveLength(2)
  expect(svg.match(/>\+<\/text>/g)).toHaveLength(2)

  // Re-annotating an instance in KiCad must also update its drawn reference.
  const secondReference = schematic.symbols[1]?.properties.find(
    (property) => property.key === "Reference",
  )
  if (!secondReference) throw new Error("Expected second instance reference")
  secondReference.value = "U42"
  const secondPath = schematic.symbols[1]?._sxInstances?.projects[0]?.paths[0]
  if (!secondPath) throw new Error("Expected second instance path")
  secondPath.reference = "U42"
  const renamedSnapshot = await takeKicadSnapshot({
    kicadFileContent: schematic.getString(),
    kicadFileType: "sch",
    generatePng: false,
  })
  const renamedSvg =
    renamedSnapshot.generatedFileContent["temp_file.svg"]!.toString()
  expect(renamedSvg.match(/>U42<\/text>/g)).toHaveLength(1)
  expect(renamedSvg).not.toContain(">U8</text>")

  await expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "schematic" }),
      snapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
