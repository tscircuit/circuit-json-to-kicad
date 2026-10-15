import { expect, test } from "bun:test"
import type { SchematicText } from "circuit-json"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { applyToPoint } from "transformation-matrix"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"

const LabeledSymbol = () => (
  <symbol name="LabeledSymbol" width={3} height={3}>
    <schematicrect width={3} height={3} strokeWidth={0.05} />
    <schematictext
      text="{REF}"
      schX={0.5}
      schY={1}
      fontSize={0.3}
      anchor="left"
    />
    <schematictext text="+" schX={-1} schY={1} fontSize={0.2} />
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

test("custom-symbol11: native references preserve label placement and follow renaming", async () => {
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
  expect(schematic.symbols.map((symbol) => symbol.libraryId)).toEqual([
    "Custom:LabeledSymbol",
    "Custom:LabeledSymbol",
  ])
  expect(
    schematic.libSymbols?.symbols.flatMap((symbol) =>
      symbol.subSymbols.flatMap((drawing) =>
        drawing.texts.map((text) => text.value),
      ),
    ),
  ).toEqual(["+"])
  expect(sourceTexts).toEqual(originalTexts)

  for (const symbol of schematic.symbols) {
    const reference = symbol.properties.find(
      (property) => property.key === "Reference",
    )!
    const sourceText = sourceTexts.find(
      (text) => text.text === reference.value,
    )!
    const expectedPosition = applyToPoint(
      converter.ctx.c2kMatSch!,
      sourceText.position,
    )
    expect(reference.effects?.hiddenText).toBe(false)
    expect(reference.at?.x).toBeCloseTo(expectedPosition.x, 5)
    expect(reference.at?.y).toBeCloseTo(expectedPosition.y, 5)
    expect(reference.effects?.font?.size?.width).toBeCloseTo(
      sourceText.font_size * converter.ctx.kicadSchematicScaleFactor!,
      5,
    )
    expect(reference.effects?.justify?.horizontal).toBe("left")
  }

  const snapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
    includeSvg: true,
  })
  const svg = snapshot.generatedFileContent["temp_file.svg"]!.toString()
  expect(svg.match(/>U7<\/text>/g)).toHaveLength(1)
  expect(svg.match(/>U8<\/text>/g)).toHaveLength(1)
  expect(svg.match(/>\+<\/text>/g)).toHaveLength(2)

  await expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "schematic" }),
      snapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)

  const renamedSymbol = schematic.symbols[1]!
  renamedSymbol.properties.find(
    (property) => property.key === "Reference",
  )!.value = "U42"
  renamedSymbol._sxInstances!.projects[0]!.paths[0]!.reference = "U42"
  const renamedSnapshot = await takeKicadSnapshot({
    kicadFileContent: schematic.getString(),
    kicadFileType: "sch",
    includeSvg: true,
    generatePng: false,
  })
  const renamedSvg =
    renamedSnapshot.generatedFileContent["temp_file.svg"]!.toString()
  expect(renamedSvg.match(/>U7<\/text>/g)).toHaveLength(1)
  expect(renamedSvg.match(/>U42<\/text>/g)).toHaveLength(1)
  expect(renamedSvg).not.toContain(">U8</text>")
})
