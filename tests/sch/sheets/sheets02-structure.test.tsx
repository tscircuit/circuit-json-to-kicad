import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { takeSchematicSheetsSnapshot } from "../../fixtures/take-schematic-sheets-snapshot"

const instancePathOf = (symbol: any): string | undefined =>
  symbol?._sxInstances?.projects?.[0]?.paths?.[0]?.value

test("hierarchical schematic files have correct sheet nodes and instance paths", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="60mm" height="60mm" routingDisabled>
      <schematicsheet name="Power" displayName="Power Supply" sheetIndex={0}>
        <resistor
          name="R1"
          resistance="10k"
          footprint="0402"
          schX={-2}
          schY={0}
        />
        <capacitor
          name="C1"
          capacitance="1uF"
          footprint="0402"
          schX={2}
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
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const files = converter.getOutputFiles({
    schematicFilename: "proj.kicad_sch",
  })

  expect(files.map((f) => f.filename)).toEqual([
    "proj.kicad_sch",
    "power.kicad_sch",
    "logic.kicad_sch",
  ])

  // --- Root file: two sheet nodes, no placed symbols ---
  const root = parseKicadSch(files[0]!.content)
  const rootUuid = root.uuid!.value
  expect(root.symbols.length).toBe(0)
  expect(root.sheets.length).toBe(2)

  const sheetInfo = root.sheets.map((s) => ({
    name: s.properties.find((p) => p.key === "Sheetname")?.value,
    file: s.properties.find((p) => p.key === "Sheetfile")?.value,
    uuid: s.uuid?.value,
  }))
  expect(sheetInfo).toEqual([
    { name: "Power Supply", file: "power.kicad_sch", uuid: sheetInfo[0]!.uuid },
    { name: "Logic Block", file: "logic.kicad_sch", uuid: sheetInfo[1]!.uuid },
  ])
  // sheet-node uuids are real and distinct
  expect(sheetInfo[0]!.uuid).toBeTruthy()
  expect(sheetInfo[1]!.uuid).toBeTruthy()
  expect(sheetInfo[0]!.uuid).not.toBe(sheetInfo[1]!.uuid)

  // --- Child "power": R1 + C1, instance path = /<rootUuid>/<sheetNodeUuid> ---
  const power = parseKicadSch(files[1]!.content)
  expect(power.symbols.length).toBe(2)
  for (const sym of power.symbols) {
    expect(instancePathOf(sym)).toBe(`/${rootUuid}/${sheetInfo[0]!.uuid}`)
  }
  // Child files carry their own uuid, distinct from the root
  expect(power.uuid!.value).not.toBe(rootUuid)
  // Child files must NOT contain nested sheet nodes
  expect(power.sheets.length).toBe(0)

  // --- Child "logic": U1 with the second sheet-node prefix ---
  const logic = parseKicadSch(files[2]!.content)
  expect(logic.symbols.length).toBe(1)
  expect(instancePathOf(logic.symbols[0])).toBe(
    `/${rootUuid}/${sheetInfo[1]!.uuid}`,
  )

  // Visual parity: tscircuit stacked sheets vs KiCad-rendered hierarchy.
  const { stackedPng } = await takeSchematicSheetsSnapshot({
    circuitJson,
    files,
    rootFilename: "proj.kicad_sch",
  })
  await Bun.write("./debug-output/sheets02-structure.stacked.png", stackedPng)
  expect(stackedPng).toMatchPngSnapshot(import.meta.path)
}, 30_000)
