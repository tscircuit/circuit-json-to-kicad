import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadSchConverter } from "lib"
import sharp from "sharp"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import reproCircuitJson from "./fixtures/repro19-inline-net-label-export.json"

type InlineNetLabel = Extract<
  CircuitJson[number],
  { type: "schematic_text" }
> & { source_trace_id: string }

test("repro19: inline net labels shift below traces and into the component", async () => {
  const circuitJson = reproCircuitJson as CircuitJson
  const inlineNetLabels = circuitJson.filter(
    (element): element is InlineNetLabel =>
      element.type === "schematic_text" && "source_trace_id" in element,
  )

  expect(inlineNetLabels).toHaveLength(5)

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()

  for (const label of inlineNetLabels) {
    expect(output).toContain(`(text "${label.text}"`)
  }

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
    fitSchematicToContent: true,
  })
  expect(kicadSnapshot.exitCode).toBe(0)

  await expect(
    stackCircuitJsonKicadPngs(
      await sharp(
        await takeCircuitJsonSnapshot({
          circuitJson,
          outputType: "schematic",
        }),
      )
        .resize(1200, 600, { fit: "contain", background: "#f5f1ed" })
        .png()
        .toBuffer(),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 60_000)
