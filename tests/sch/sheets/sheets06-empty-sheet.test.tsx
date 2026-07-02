import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { takeSchematicSheetsSnapshot } from "../../fixtures/take-schematic-sheets-snapshot"

// A declared-but-empty sheet still yields a (sheet) node + a valid child file.
test("an empty schematic sheet produces a valid child file that kicad renders", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="40mm" height="40mm" routingDisabled>
      <schematicsheet name="Populated" displayName="Populated" sheetIndex={0}>
        <resistor
          name="R1"
          resistance="10k"
          footprint="0402"
          schX={0}
          schY={0}
        />
      </schematicsheet>
      <schematicsheet name="Empty" displayName="Empty" sheetIndex={1} />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const files = converter.getOutputFiles({
    schematicFilename: "proj.kicad_sch",
  })

  expect(files.length).toBe(3)

  const root = parseKicadSch(files[0]!.content)
  expect(root.sheets.length).toBe(2)

  const empty = files.find((f) => f.filename === "empty.kicad_sch")!
  const emptySch = parseKicadSch(empty.content)
  expect(emptySch.symbols.length).toBe(0)

  // Even with an empty sheet, kicad-cli renders the full hierarchy.
  const { stackedPng, svgNames } = await takeSchematicSheetsSnapshot({
    circuitJson,
    files,
    rootFilename: "proj.kicad_sch",
  })
  expect(svgNames.length).toBe(3)
  await Bun.write("./debug-output/sheets06-empty-sheet.stacked.png", stackedPng)
  expect(stackedPng).toMatchPngSnapshot(import.meta.path)
}, 30_000)
