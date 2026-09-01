import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import type {
  CircuitJson,
  SchematicComponent,
  SchematicPort,
  SchematicText,
  SourceComponentBase,
} from "circuit-json"
import { CircuitJsonToKicadSchConverter } from "lib"
import sharp from "sharp"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro26: Ethernet pin names collide with connected net labels", async () => {
  const circuitJson = JSON.parse(
    await readFile(
      new URL(
        "./fixtures/repro26-ethernet-pin-label-collision.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as CircuitJson

  const ethernetConnector = circuitJson.find(
    (element) =>
      element.type === "source_component" && element.name === "J_ETH",
  ) as SourceComponentBase | undefined
  const placedConnector = circuitJson.find(
    (element) =>
      element.type === "schematic_component" &&
      element.source_component_id === ethernetConnector?.source_component_id,
  ) as SchematicComponent | undefined
  const connectorPorts = circuitJson.filter(
    (element) =>
      element.type === "schematic_port" &&
      element.schematic_component_id ===
        placedConnector?.schematic_component_id,
  ) as SchematicPort[]
  const ethernetNetTexts = circuitJson.filter(
    (element) =>
      element.type === "schematic_text" && element.text.startsWith("ETH_MDI"),
  ) as SchematicText[]

  expect(ethernetConnector?.manufacturer_part_number).toBe("HR911130A")
  expect(connectorPorts).toHaveLength(16)
  expect(
    connectorPorts.some((port) => port.display_pin_label === "MDI0+"),
  ).toBe(true)
  expect(ethernetNetTexts).toHaveLength(16)

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  expect(output).toContain('(name "MDI0+"')
  expect(output).toContain('(text "ETH_MDI0_P"')

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
  })
  expect(kicadSnapshot.exitCode).toBe(0)
  const schematicPng = await sharp(
    await takeCircuitJsonSnapshot({ circuitJson, outputType: "schematic" }),
  )
    .resize(1200, 850, { fit: "contain", background: "#f5f1ed" })
    .png()
    .toBuffer()

  await expect(
    stackCircuitJsonKicadPngs(
      schematicPng,
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 120_000)
