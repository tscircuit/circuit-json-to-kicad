import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import sharp from "sharp"
import { Circuit } from "tscircuit-latest"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro24: schematic box border is missing from KiCad", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board>
      <schematicbox
        title="CONTROL BLOCK"
        titleAlignment="top_left"
        schX={0}
        schY={0}
        width={5}
        height={3}
        strokeStyle="dashed"
      />
      <resistor name="R1" resistance="10k" schX={0} schY={0} />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  expect(
    circuitJson.filter((element) => element.type === "schematic_box"),
  ).toHaveLength(1)

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const schematic = parseKicadSch(output)
  expect(schematic.polylines).toHaveLength(0)

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
