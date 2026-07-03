import { test, expect } from "bun:test"
import type { SubcircuitProps } from "@tscircuit/props"
import { Circuit } from "tscircuit"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { takeSchematicSheetsSnapshot } from "../../fixtures/take-schematic-sheets-snapshot"

/** A small I2C sensor block: sensor IC + VDD decoupling + SDA/SCL pull-ups. */
const I2cSensor = (props: SubcircuitProps) => (
  <subcircuit {...props}>
    <chip
      name="U1"
      footprint="soic6"
      pinLabels={{
        pin1: "VDD",
        pin2: "GND",
        pin3: "SDA",
        pin4: "SCL",
        pin5: "INT",
        pin6: "ADDR",
      }}
      schPinArrangement={{
        leftSide: { direction: "top-to-bottom", pins: ["VDD", "GND"] },
        rightSide: {
          direction: "top-to-bottom",
          pins: ["SDA", "SCL", "INT", "ADDR"],
        },
      }}
      connections={{ VDD: "net.VDD", GND: "net.GND" }}
      schX={0}
      schY={0}
    />
    <capacitor
      name="C_VDD"
      capacitance="100nF"
      footprint="0402"
      connections={{ pin1: "U1.VDD", pin2: "net.GND" }}
      schX={-3}
      schY={-0.5}
      schRotation={270}
    />
    <resistor
      name="R_SDA"
      resistance="4.7k"
      footprint="0402"
      connections={{ pin1: "U1.SDA", pin2: "U1.VDD" }}
      schX={3}
      schY={1.5}
      schRotation={270}
    />
    <resistor
      name="R_SCL"
      resistance="4.7k"
      footprint="0402"
      connections={{ pin1: "U1.SCL", pin2: "U1.VDD" }}
      schX={4.5}
      schY={1.5}
      schRotation={270}
    />
  </subcircuit>
)

/** A generic microcontroller block: MCU + VDD decoupling cap + reset pull-up. */
const McuModule = (props: SubcircuitProps) => (
  <subcircuit {...props}>
    <chip
      name="U1"
      footprint="soic8"
      pinLabels={{
        pin1: "VDD",
        pin2: "GND",
        pin3: "RESET",
        pin4: "SWDIO",
        pin5: "SWCLK",
        pin6: "IO1",
        pin7: "IO2",
        pin8: "IO3",
      }}
      schPinArrangement={{
        leftSide: { direction: "top-to-bottom", pins: ["VDD", "RESET", "GND"] },
        rightSide: {
          direction: "top-to-bottom",
          pins: ["SWDIO", "SWCLK", "IO1", "IO2", "IO3"],
        },
      }}
      connections={{ VDD: "net.VDD", GND: "net.GND" }}
      schX={0}
      schY={0}
    />
    <capacitor
      name="C_VDD"
      capacitance="100nF"
      footprint="0402"
      connections={{ pin1: "U1.VDD", pin2: "net.GND" }}
      schX={-3}
      schY={-0.5}
      schRotation={270}
    />
    <resistor
      name="R_RST"
      resistance="10k"
      footprint="0402"
      connections={{ pin1: "U1.RESET", pin2: "U1.VDD" }}
      schX={-3}
      schY={1.5}
      schRotation={270}
    />
  </subcircuit>
)

test("two subcircuits (I2C sensor + MCU) each on their own schematic sheet", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board routingDisabled>
      <schematicsheet name="Sheet 1" displayName="Sheet 1" sheetIndex={0} />
      <schematicsheet name="Sheet 2" displayName="Sheet 2" sheetIndex={1} />

      <I2cSensor name="SEN" schSheetName="Sheet 1" />
      <McuModule name="MCU" schSheetName="Sheet 2" />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const files = converter.getOutputFiles({
    schematicFilename: "proj.kicad_sch",
  })

  // Root schematic + one child file per sheet.
  expect(files.map((f) => f.filename)).toEqual([
    "proj.kicad_sch",
    "sheet_1.kicad_sch",
    "sheet_2.kicad_sch",
  ])

  const root = parseKicadSch(files[0]!.content)
  const rootUuid = root.uuid!.value
  expect(root.symbols.length).toBe(0)
  expect(root.sheets.length).toBe(2)

  const sheetNodeUuids = root.sheets.map((s) => s.uuid!.value)

  // The real placed components (chips/passives) partition cleanly by sheet:
  // Sheet 1 (I2C sensor) has U1 + C_VDD + R_SDA + R_SCL = 4 components,
  // Sheet 2 (MCU) has U1 + C_VDD + R_RST = 3 components.
  const componentsOnSheet = (sheetId: string) =>
    (circuitJson as any[]).filter(
      (el) =>
        el.type === "schematic_component" && el.schematic_sheet_id === sheetId,
    ).length
  const [sheet1Id, sheet2Id] = (circuitJson as any[])
    .filter((el) => el.type === "schematic_sheet")
    .sort((a, b) => (a.sheet_index ?? 0) - (b.sheet_index ?? 0))
    .map((el) => el.schematic_sheet_id)
  expect(componentsOnSheet(sheet1Id)).toBe(4)
  expect(componentsOnSheet(sheet2Id)).toBe(3)

  // Every KiCad symbol on a child file (component symbols AND the power-rail
  // symbols generated from net.VDD/net.GND) carries that sheet's instance path.
  const pathOf = (sym: any) =>
    sym?._sxInstances?.projects?.[0]?.paths?.[0]?.value

  const sheet1 = parseKicadSch(files[1]!.content)
  expect(sheet1.symbols.length).toBeGreaterThanOrEqual(4)
  for (const sym of sheet1.symbols) {
    expect(pathOf(sym)).toBe(`/${rootUuid}/${sheetNodeUuids[0]}`)
  }

  const sheet2 = parseKicadSch(files[2]!.content)
  expect(sheet2.symbols.length).toBeGreaterThanOrEqual(3)
  for (const sym of sheet2.symbols) {
    expect(pathOf(sym)).toBe(`/${rootUuid}/${sheetNodeUuids[1]}`)
  }

  // Visual parity: tscircuit stacked sheets vs KiCad-rendered hierarchy.
  const { stackedPng, svgNames } = await takeSchematicSheetsSnapshot({
    circuitJson,
    files,
    rootFilename: "proj.kicad_sch",
  })
  expect(svgNames.length).toBe(3)
  await Bun.write(
    "./debug-output/sheets08-i2c-sensor-and-mcu.stacked.png",
    stackedPng,
  )
  expect(stackedPng).toMatchPngSnapshot(import.meta.path)
}, 30_000)
