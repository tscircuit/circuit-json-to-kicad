import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import sharp from "sharp"
import { Circuit } from "tscircuit-latest"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro24: dashed schematic line becomes solid in KiCad", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board>
      <schematictext text="BASIC LINE" schX={-3.2} schY={1} fontSize={0.25} />
      <schematicline x1={-1.5} y1={1} x2={3} y2={1} />
      <schematictext text="DASHED LINE" schX={-3.2} schY={-1} fontSize={0.25} />
      <schematicline
        x1={-1.5}
        y1={-1}
        x2={3}
        y2={-1}
        isDashed
        dashLength={0.35}
        dashGap={0.2}
      />
      <resistor name="R1" resistance="10k" schX={0.75} schY={-3} />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const lines = circuitJson.filter(
    (element) => element.type === "schematic_line",
  )
  expect(lines).toHaveLength(2)
  expect(lines.filter((line) => line.is_dashed)).toHaveLength(1)

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const schematic = parseKicadSch(output)
  expect(schematic.polylines).toHaveLength(2)
  expect(
    schematic.polylines.filter((line) => line.stroke?.type === "default"),
  ).toHaveLength(2)

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
