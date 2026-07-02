import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { takeSchematicSheetsSnapshot } from "../../fixtures/take-schematic-sheets-snapshot"

test("two schematic sheets render as a hierarchy via kicad-cli", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="60mm" height="60mm" routingDisabled>
      <schematicsheet name="Power" displayName="Power" sheetIndex={0}>
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
      <schematicsheet name="Logic" displayName="Logic" sheetIndex={1}>
        <chip
          name="U1"
          footprint="soic8"
          schX={0}
          schY={0}
          pinLabels={{ pin1: "GND", pin8: "VCC" }}
        />
      </schematicsheet>
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const files = converter.getOutputFiles({
    schematicFilename: "sheets01.kicad_sch",
  })

  // root + one file per sheet
  expect(files.length).toBe(3)

  const { stackedPng, svgNames } = await takeSchematicSheetsSnapshot({
    circuitJson,
    files,
    rootFilename: "sheets01.kicad_sch",
  })

  // root sheet + both child sheets each produce an SVG
  expect(svgNames.length).toBe(3)

  await Bun.write(
    "./debug-output/sheets01-two-sheets-nested.stacked.png",
    stackedPng,
  )

  expect(stackedPng).toMatchPngSnapshot(import.meta.path)
}, 30_000)
