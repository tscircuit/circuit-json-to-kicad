import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"

test("child sheet filenames are sanitized and avoid the root filename", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="60mm" height="60mm" routingDisabled>
      <schematicsheet name="index" displayName="Index" sheetIndex={0}>
        <resistor
          name="R1"
          resistance="1k"
          footprint="0402"
          schX={0}
          schY={0}
        />
      </schematicsheet>
      <schematicsheet
        name="Power / Input"
        displayName="Power Input"
        sheetIndex={1}
      >
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

  const converter = new CircuitJsonToKicadSchConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const files = converter.getOutputFiles({
    schematicFilename: "index.kicad_sch",
  })

  expect(files.map((file) => file.filename)).toEqual([
    "index.kicad_sch",
    "index_2.kicad_sch",
    "power_input.kicad_sch",
  ])
  expect(new Set(files.map((file) => file.filename)).size).toBe(files.length)

  const root = parseKicadSch(files[0]!.content)
  expect(
    root.sheets.map(
      (sheet) =>
        sheet.properties.find((property) => property.key === "Sheetfile")
          ?.value,
    ),
  ).toEqual(["index_2.kicad_sch", "power_input.kicad_sch"])
})
