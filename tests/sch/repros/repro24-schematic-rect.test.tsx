import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import sharp from "sharp"
import { Circuit } from "tscircuit-latest"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro24: schematic rectangle is missing from KiCad", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board>
      <crystal
        name="Y1"
        frequency="25MHz"
        loadCapacitance="18pF"
        manufacturerPartNumber="X322525MRB4SI"
        supplierPartNumbers={{ jlcpcb: ["C70593"] }}
        schX={0}
        schY={0}
      />
      <resistor name="R1" resistance="1k" schX={-4} schY={0} />
      <resistor name="R2" resistance="1k" schX={4} schY={0} />
      <trace from=".R1 > .pin2" to=".Y1 > .pin1" />
      <trace from=".Y1 > .pin2" to=".R2 > .pin1" />
      <schematicrect
        schX={0}
        schY={0}
        width={3.2}
        height={2.2}
        strokeWidth={0.08}
      />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const rectangles = circuitJson.filter(
    (element) => element.type === "schematic_rect",
  )
  expect(rectangles).toHaveLength(1)
  expect(rectangles[0]?.rotation).toBe(0)

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  expect(output).not.toContain("(rectangle")

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
