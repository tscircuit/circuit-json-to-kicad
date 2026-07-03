import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { takeSchematicSheetsSnapshot } from "../../fixtures/take-schematic-sheets-snapshot"

// A net shared across sheets is represented as a same-named label on each sheet.
// In KiCad that same name connects the sheets (global-label / power-symbol
// semantics), so the label must be present in every child file that uses it.
test("a net shared across sheets appears on each sheet's file", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="60mm" height="60mm">
      <schematicsheet name="Power" displayName="Power" sheetIndex={0}>
        <resistor
          name="R1"
          resistance="10k"
          footprint="0402"
          schX={-2}
          schY={0}
        />
        <netlabel
          net="VCC"
          schX={-4}
          schY={2}
          anchorSide="bottom"
          connectsTo=".R1 > .pin1"
        />
      </schematicsheet>
      <schematicsheet name="Logic" displayName="Logic" sheetIndex={1}>
        <chip
          name="U1"
          footprint="soic8"
          schX={0}
          schY={0}
          pinLabels={{ pin8: "VCC" }}
        />
        <netlabel
          net="VCC"
          schX={4}
          schY={2}
          anchorSide="bottom"
          connectsTo=".U1 > .pin8"
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

  const power = files.find((f) => f.filename === "power.kicad_sch")!
  const logic = files.find((f) => f.filename === "logic.kicad_sch")!

  // The shared net "VCC" is present on both sheets (either as a global label or
  // a power symbol) so KiCad connects them by name across the hierarchy.
  expect(power.content).toContain("VCC")
  expect(logic.content).toContain("VCC")

  // And the whole hierarchy still renders in KiCad.
  const { stackedPng, svgNames } = await takeSchematicSheetsSnapshot({
    circuitJson,
    files,
    rootFilename: "proj.kicad_sch",
  })
  expect(svgNames.length).toBe(3)
  await Bun.write(
    "./debug-output/sheets04-cross-sheet-net.stacked.png",
    stackedPng,
  )
  expect(stackedPng).toMatchPngSnapshot(import.meta.path)
}, 30_000)
