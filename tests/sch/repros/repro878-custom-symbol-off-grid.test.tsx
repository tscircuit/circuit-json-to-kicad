import { expect, test } from "bun:test"
import { $ } from "bun"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseKicadSch } from "kicadts"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

const MySymbol = () => (
  <symbol name="MyPart">
    <schematicpath
      strokeWidth={0.05}
      points={[
        { x: -0.5, y: -0.3 },
        { x: 0.5, y: -0.3 },
        { x: 0.5, y: 0.3 },
        { x: -0.5, y: 0.3 },
        { x: -0.5, y: -0.3 },
      ]}
    />
    <port name="1" pinNumber={1} direction="right" schX={0.5} schY={0} />
  </symbol>
)

const Example = () => (
  <board width="20mm" height="10mm">
    <chip name="U1" footprint="0402" symbol={<MySymbol />} />
  </board>
)

export default Example

test("repro878: custom-symbol pins lie on the KiCad connection grid", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(<Example />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  await Bun.write(
    "./debug-output/repro878-custom-symbol-off-grid.kicad_sch",
    output,
  )

  const directory = await mkdtemp(join(tmpdir(), "repro878-erc-"))
  try {
    const schematicPath = join(directory, "repro878.kicad_sch")
    const reportPath = join(directory, "erc.json")
    await writeFile(schematicPath, output)
    await $`kicad-cli sch erc --format json --output ${reportPath} ${schematicPath}`.quiet()
    const report: {
      sheets: {
        violations: {
          type: string
          severity: string
          items: { description: string }[]
        }[]
      }[]
    } = JSON.parse(await readFile(reportPath, "utf8"))
    const offGridWarnings = report.sheets
      .flatMap((sheet) => sheet.violations)
      .filter((violation) => violation.type === "endpoint_off_grid")
      .map(({ type, severity, items }) => ({
        type,
        severity,
        items: items.map((item) => item.description),
      }))

    // Unconnected pins and the unavailable Custom library are separate checks.
    expect(offGridWarnings).toEqual([])
    const schematic = parseKicadSch(output)
    const symbol = schematic.libSymbols!.symbols.find(
      (symbol) => symbol.libraryId === "Custom:MyPart",
    )!
    expect({
      polylines: symbol.subSymbols.flatMap((unit) =>
        unit.polylines.map((polyline) =>
          polyline.getString().replace(/\s+/g, " "),
        ),
      ),
      pins: symbol.subSymbols.flatMap((unit) =>
        unit.pins.map((pin) => ({
          at: pin.at?.getString(),
          length: pin.length,
        })),
      ),
      offGridWarnings,
    }).toMatchSnapshot()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }

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
