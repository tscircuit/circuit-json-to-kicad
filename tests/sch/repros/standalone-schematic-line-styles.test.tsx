import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("standalone schematic line styles are preserved on export", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board>
      <schematictext
        text="0.08 mm SOLID"
        schX={-4}
        schY={1.7}
        anchor="left"
        fontSize={0.3}
      />
      <schematicline x1={-4} y1={1} x2={4} y2={1} strokeWidth={0.08} />

      <schematictext
        text="0.04 mm DASHED"
        schX={-4}
        schY={-0.3}
        anchor="left"
        fontSize={0.3}
      />
      <schematicline
        x1={-4}
        y1={-1}
        x2={4}
        y2={-1}
        strokeWidth={0.04}
        isDashed
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const sourceLines = circuitJson.filter(
    (element) => element.type === "schematic_line",
  )
  expect(
    sourceLines.map(({ stroke_width, is_dashed }) => ({
      stroke_width,
      is_dashed,
    })),
  ).toEqual([
    { stroke_width: 0.08, is_dashed: false },
    { stroke_width: 0.04, is_dashed: true },
  ])

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const output = converter.getOutputString()
  const parsedSchematic = parseKicadSch(output)
  expect(
    parsedSchematic.polylines.map((polyline) => ({
      width: polyline.stroke?.width,
      type: polyline.stroke?.type,
    })),
  ).toEqual([
    { width: 1.2, type: "default" },
    { width: 0.6, type: "dash" },
  ])

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
  })
  expect(kicadSnapshot.exitCode).toBe(0)

  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({
        circuitJson,
        outputType: "schematic",
      }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 10_000)
