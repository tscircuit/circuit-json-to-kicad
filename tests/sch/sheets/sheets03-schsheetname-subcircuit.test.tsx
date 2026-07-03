import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { takeSchematicSheetsSnapshot } from "../../fixtures/take-schematic-sheets-snapshot"

// A subcircuit assigned to a sheet by name cascades its children onto that sheet.
test("schSheetName on a subcircuit places its children on the named sheet", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="60mm" height="60mm" routingDisabled>
      <schematicsheet name="Sheet 1" displayName="Sheet 1" sheetIndex={0} />
      <schematicsheet name="Sheet 2" displayName="Sheet 2" sheetIndex={1} />

      <group subcircuit name="RegBlock" schSheetName="Sheet 1">
        <resistor
          name="R1"
          resistance="10k"
          footprint="0402"
          schX={-2}
          schY={0}
        />
        <resistor
          name="R2"
          resistance="1k"
          footprint="0402"
          schX={2}
          schY={0}
        />
      </group>

      <chip name="U1" footprint="soic8" schSheetName="Sheet 2" />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const files = converter.getOutputFiles({
    schematicFilename: "proj.kicad_sch",
  })

  expect(files.map((f) => f.filename)).toEqual([
    "proj.kicad_sch",
    "sheet_1.kicad_sch",
    "sheet_2.kicad_sch",
  ])

  const root = parseKicadSch(files[0]!.content)
  expect(root.sheets.length).toBe(2)
  expect(root.symbols.length).toBe(0)

  // Sheet 1 got the two subcircuit resistors
  const sheet1 = parseKicadSch(files[1]!.content)
  expect(sheet1.symbols.length).toBe(2)

  // Sheet 2 got the standalone chip
  const sheet2 = parseKicadSch(files[2]!.content)
  expect(sheet2.symbols.length).toBe(1)

  const { stackedPng } = await takeSchematicSheetsSnapshot({
    circuitJson,
    files,
    rootFilename: "proj.kicad_sch",
  })
  await Bun.write(
    "./debug-output/sheets03-schsheetname-subcircuit.stacked.png",
    stackedPng,
  )
  expect(stackedPng).toMatchPngSnapshot(import.meta.path)
}, 30_000)
