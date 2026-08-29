import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import sharp from "sharp"
import { Circuit } from "tscircuit-latest"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro24: rectangle, box, and table graphics are missing from KiCad", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board>
      <chip
        name="U_RECT"
        schX={0}
        schY={2.5}
        symbol={
          <symbol>
            <schematicrect
              schX={0}
              schY={0}
              width={2.4}
              height={1.4}
              strokeWidth={0.08}
            />
            <schematicline x1={-0.5} y1={-0.3} x2={0.5} y2={0.3} />
            <schematicline x1={-0.5} y1={0.3} x2={0.5} y2={-0.3} />
            <port name="IN" direction="left" schX={-1.2} schY={0} />
            <port name="OUT" direction="right" schX={1.2} schY={0} />
          </symbol>
        }
      />
      <resistor name="R1" resistance="1k" schX={-4} schY={2.5} />
      <resistor name="R2" resistance="1k" schX={4} schY={2.5} />
      <trace from=".R1 > .pin2" to=".U_RECT > .IN" />
      <trace from=".U_RECT > .OUT" to=".R2 > .pin1" />

      <schematicbox
        title="CONTROL BLOCK"
        titleAlignment="top_left"
        schX={-3}
        schY={-1}
        width={3.5}
        height={2}
        strokeStyle="dashed"
      />

      <schematictable schX={1} schY={0} borderWidth={0.05} fontSize={0.25}>
        <schematicrow height={0.6}>
          <schematiccell text="Signal" width={1.5} />
          <schematiccell text="Purpose" width={2} />
        </schematicrow>
        <schematicrow height={0.6}>
          <schematiccell text="IN" />
          <schematiccell text="Input" />
        </schematicrow>
      </schematictable>
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  expect(
    circuitJson.filter((element) => element.type === "schematic_rect"),
  ).toHaveLength(1)
  expect(
    circuitJson.filter((element) => element.type === "schematic_box"),
  ).toHaveLength(1)
  expect(
    circuitJson.filter((element) => element.type === "schematic_table"),
  ).toHaveLength(1)
  expect(
    circuitJson.filter((element) => element.type === "schematic_table_cell"),
  ).toHaveLength(4)

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const schematic = parseKicadSch(output)

  expect(output).not.toContain("(rectangle")
  expect(output).not.toContain("Signal")
  expect(output).not.toContain("Purpose")
  expect(schematic.polylines).toHaveLength(0)

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
  })
  expect(kicadSnapshot.exitCode).toBe(0)
  const circuitJsonPng = await sharp(
    await takeCircuitJsonSnapshot({
      circuitJson,
      outputType: "schematic",
    }),
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
