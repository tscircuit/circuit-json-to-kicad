import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadSchConverter } from "lib"
import { takeSchematicSheetsSnapshot } from "../../fixtures/take-schematic-sheets-snapshot"

const fixtureUrl = new URL(
  "../../assets/repro19-consumer-wireless-generated-system.circuit.json",
  import.meta.url,
)

test("repro19: convert the Consumer Wireless Module generated system", async () => {
  const circuitJson = JSON.parse(
    await readFile(fixtureUrl, "utf8"),
  ) as CircuitJson
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const rootFilename = "consumer_wireless_module.kicad_sch"
  const files = converter.getOutputFiles({ schematicFilename: rootFilename })
  expect(files.map(({ filename }) => filename)).toEqual([
    rootFilename,
    "system_diagram.kicad_sch",
    "dc_dc_power_supply.kicad_sch",
    "input_power_protection.kicad_sch",
    "io_connection.kicad_sch",
    "io_protection.kicad_sch",
    "logic_control.kicad_sch",
    "sensors.kicad_sch",
    "wireless_connectivity.kicad_sch",
  ])

  const { stackedPng, svgFiles, svgNames } = await takeSchematicSheetsSnapshot({
    circuitJson,
    files,
    rootFilename,
  })

  expect(svgNames).toEqual([
    "consumer_wireless_module.svg",
    "consumer_wireless_module-System Diagram.svg",
    "consumer_wireless_module-TPS62086 DC_DC Power Supply.svg",
    "consumer_wireless_module-TPS25910 Input Power Protection.svg",
    "consumer_wireless_module-SN65LVDS31 I_O Connection.svg",
    "consumer_wireless_module-TPD2E009 I_O Protection.svg",
    "consumer_wireless_module-SN74LVC1G34 Logic and Control.svg",
    "consumer_wireless_module-TMP103 Sensors.svg",
    "consumer_wireless_module-W3006 Wireless Connectivity Antenna.svg",
  ])
  for (const svgName of svgNames) {
    expect(svgFiles[svgName]).toMatchSvgSnapshot(
      import.meta.path,
      svgName.replace(/\.svg$/, "").replace(/[^a-zA-Z0-9_-]+/g, "_"),
    )
  }

  await Bun.write(
    "./debug-output/repro19-consumer-wireless-generated-system.stacked.png",
    stackedPng,
  )
  expect(stackedPng).toMatchPngSnapshot(import.meta.path)
}, 30_000)
