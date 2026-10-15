import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"

const Artwork = ({
  name = "Variant",
  text = "fixed",
  width = 1,
}: {
  name?: string
  text?: string
  width?: number
}) => (
  <symbol name={name}>
    <schematicrect
      schX={0}
      schY={0}
      width={width}
      height={1}
      strokeWidth={0.05}
    />
    <schematictext text={text} schX={0} schY={0} fontSize={0.2} />
  </symbol>
)

const Example = () => (
  <board width={20} height={10}>
    <chip
      name="U1"
      schX={-4}
      schY={2}
      pcbX={-4}
      pcbY={2}
      symbol={<Artwork />}
    />
    <chip name="U2" schY={2} pcbY={2} symbol={<Artwork />} />
    <chip
      name="U3"
      schX={4}
      schY={2}
      pcbX={4}
      pcbY={2}
      symbol={<Artwork width={1.5} />}
    />
    <chip
      name="U4"
      schX={-4}
      schY={-2}
      pcbX={-4}
      pcbY={-2}
      symbol={<Artwork text="other" />}
    />
    <chip
      name="U5"
      schY={-2}
      pcbY={-2}
      symbol={<Artwork name="Variant__2" text="reserved" />}
    />
    <chip
      name="U6"
      schX={4}
      schY={-2}
      pcbX={4}
      pcbY={-2}
      symbol={<Artwork width={1.5} />}
    />
  </board>
)

export default Example

test("custom-symbol12: identical contents share a definition and differing contents get collision-free variants", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(<Example />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const schematic = parseKicadSch(output)
  const symbols = schematic.libSymbols?.symbols ?? []
  expect(symbols.map((symbol) => symbol.libraryId)).toEqual([
    "Custom:Variant",
    "Custom:Variant__3",
    "Custom:Variant__4",
    "Custom:Variant__2",
  ])
  expect(schematic.symbols.map((symbol) => symbol.libraryId)).toEqual([
    "Custom:Variant",
    "Custom:Variant",
    "Custom:Variant__3",
    "Custom:Variant__4",
    "Custom:Variant__2",
    "Custom:Variant__3",
  ])
  for (const symbol of symbols) {
    const name = symbol.libraryId!.split(":")[1]!
    expect(symbol.subSymbols.map((child) => child.libraryId)).toEqual([
      `${name}_0_1`,
      `${name}_1_1`,
    ])
  }

  const snapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
    includeSvg: true,
  })
  const svg = snapshot.generatedFileContent["temp_file.svg"]!.toString()
  expect(svg.match(/>fixed<\/text>/g)).toHaveLength(4)
  expect(svg.match(/>other<\/text>/g)).toHaveLength(1)
  expect(svg.match(/>reserved<\/text>/g)).toHaveLength(1)
  expect(
    svg.match(/<rect\b[^>]*width="22.500000"[^>]*height="15.000000"/g),
  ).toHaveLength(2)
  expect(
    svg.match(/<rect\b[^>]*width="15.000000"[^>]*height="15.000000"/g),
  ).toHaveLength(4)
  await expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "schematic" }),
      snapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
