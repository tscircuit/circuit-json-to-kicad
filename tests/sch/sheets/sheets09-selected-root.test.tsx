import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadProConverter } from "lib/project/CircuitJsonToKicadProConverter"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { takeSchematicSheetsSnapshot } from "../../fixtures/take-schematic-sheets-snapshot"

const instancePathOf = (symbol: any): string | undefined =>
  symbol?._sxInstances?.projects?.[0]?.paths?.[0]?.value

test("a selected schematic sheet becomes the KiCad root page", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="60mm" height="60mm" routingDisabled>
      <resistor
        name="RROOT"
        resistance="100"
        footprint="0402"
        schX={-4}
        schY={0}
      />
      <schematicsheet name="Power" displayName="Power Supply" sheetIndex={0}>
        <resistor
          name="R1"
          resistance="10k"
          footprint="0402"
          schX={0}
          schY={0}
        />
      </schematicsheet>
      <schematicsheet name="Logic" displayName="Logic Block" sheetIndex={1}>
        <chip name="U1" footprint="soic8" schX={0} schY={0} />
      </schematicsheet>
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const powerSheetId = (circuitJson as any[]).find(
    (element) => element.type === "schematic_sheet" && element.name === "Power",
  )!.schematic_sheet_id

  const defaultConverter = new CircuitJsonToKicadSchConverter(circuitJson)
  defaultConverter.runUntilFinished()
  const defaultFiles = defaultConverter.getOutputFiles({
    schematicFilename: "default.kicad_sch",
  })
  expect(defaultFiles.map((file) => file.filename)).toEqual([
    "default.kicad_sch",
    "power.kicad_sch",
    "logic.kicad_sch",
  ])
  const defaultRoot = parseKicadSch(defaultFiles[0]!.content)
  expect(defaultRoot.symbols.length).toBe(1)
  expect(defaultRoot.sheets.length).toBe(2)

  const converter = new CircuitJsonToKicadSchConverter(circuitJson, {
    rootSchematicSheetId: powerSheetId,
  })
  converter.runUntilFinished()
  const files = converter.getOutputFiles({
    schematicFilename: "project.kicad_sch",
  })

  expect(files.map((file) => file.filename)).toEqual([
    "project.kicad_sch",
    "logic.kicad_sch",
  ])

  const root = parseKicadSch(files[0]!.content)
  expect(root.symbols.length).toBe(2)
  expect(root.sheets.length).toBe(1)
  for (const symbol of root.symbols) {
    expect(instancePathOf(symbol)).toBe(`/${root.uuid!.value}`)
  }

  const childSheetBottom =
    root.sheets[0]!.position!.y + root.sheets[0]!.size!.height
  const topmostRootSymbol = Math.min(
    ...root.symbols.map((symbol) => symbol.at!.y),
  )
  expect(childSheetBottom).toBeLessThan(topmostRootSymbol)

  const childSheetNodeUuid = root.sheets[0]!.uuid!.value
  const logic = parseKicadSch(files[1]!.content)
  expect(logic.symbols.length).toBe(1)
  expect(instancePathOf(logic.symbols[0])).toBe(
    `/${root.uuid!.value}/${childSheetNodeUuid}`,
  )

  const projectConverter = new CircuitJsonToKicadProConverter(circuitJson, {
    projectName: "project",
    schematicSheetPlan: converter.schematicSheetPlan,
  })
  expect(projectConverter.getOutput().sheets).toEqual([
    [root.uuid!.value, "Power Supply"],
    [childSheetNodeUuid, "Logic Block"],
  ])

  const { svgNames } = await takeSchematicSheetsSnapshot({
    circuitJson,
    files,
    rootFilename: "project.kicad_sch",
  })
  expect(svgNames.length).toBe(2)
}, 30_000)

test("selecting an unknown root schematic sheet fails clearly", () => {
  expect(
    () =>
      new CircuitJsonToKicadSchConverter([], {
        rootSchematicSheetId: "schematic_sheet_missing",
      }),
  ).toThrow('Unknown rootSchematicSheetId "schematic_sheet_missing"')
})
