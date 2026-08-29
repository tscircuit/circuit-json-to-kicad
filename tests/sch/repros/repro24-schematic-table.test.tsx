import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import sharp from "sharp"
import { Circuit } from "tscircuit-latest"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro24: schematic table is missing from KiCad", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board>
      <schematictable schX={0} schY={0} borderWidth={0.05} fontSize={0.25}>
        <schematicrow height={0.8}>
          <schematiccell text="Signal" width={2} />
          <schematiccell text="Purpose" width={2.5} />
        </schematicrow>
        <schematicrow height={0.8}>
          <schematiccell text="IN" />
          <schematiccell text="Input" />
        </schematicrow>
      </schematictable>
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  expect(
    circuitJson.filter((element) => element.type === "schematic_table"),
  ).toHaveLength(1)
  expect(
    circuitJson.filter((element) => element.type === "schematic_table_cell"),
  ).toHaveLength(4)

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  expect(output).not.toContain("Signal")
  expect(output).not.toContain("Purpose")
  expect(output).not.toContain("Input")

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
  })
  expect(kicadSnapshot.exitCode).toBe(0)
  const circuitJsonPng = await sharp(
    await takeCircuitJsonSnapshot({ circuitJson, outputType: "schematic" }),
  )
    .resize(1200, 650, { fit: "contain", background: "#f5f1ed" })
    .png()
    .toBuffer()
  await expect(
    stackCircuitJsonKicadPngs(
      circuitJsonPng,
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 60_000)
