import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { takeSchematicSheetsSnapshot } from "../../fixtures/take-schematic-sheets-snapshot"

// Components not assigned to any sheet stay on the root page alongside the
// (sheet) nodes.
test("loose root-level components live on the root page next to the sheet nodes", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="60mm" height="60mm" routingDisabled>
      {/* not in any sheet -> root page */}
      <resistor
        name="RROOT"
        resistance="100"
        footprint="0402"
        schX={0}
        schY={0}
      />

      <schematicsheet name="Sub" displayName="Sub" sheetIndex={0}>
        <capacitor
          name="C1"
          capacitance="1uF"
          footprint="0402"
          schX={0}
          schY={0}
        />
      </schematicsheet>
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const files = converter.getOutputFiles({
    schematicFilename: "proj.kicad_sch",
  })

  expect(files.length).toBe(2)

  const root = parseKicadSch(files[0]!.content)
  // Root has the loose resistor AND the sheet node
  expect(root.symbols.length).toBe(1)
  expect(root.sheets.length).toBe(1)

  const child = parseKicadSch(files[1]!.content)
  expect(child.symbols.length).toBe(1)

  const { stackedPng } = await takeSchematicSheetsSnapshot({
    circuitJson,
    files,
    rootFilename: "proj.kicad_sch",
  })
  await Bun.write(
    "./debug-output/sheets05-root-plus-sheets.stacked.png",
    stackedPng,
  )
  expect(stackedPng).toMatchPngSnapshot(import.meta.path)
}, 30_000)
