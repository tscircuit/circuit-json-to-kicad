import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit-latest"
import type { CircuitJson } from "circuit-json"
import { parseKicadSch } from "kicadts"
import { applyToPoint } from "transformation-matrix"
import { stackSchematicCircuitJsonKicadPngs } from "../../fixtures/stackSchematicCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

type InlineNetLabel = Extract<
  CircuitJson[number],
  { type: "schematic_text" }
> & { source_trace_id: string }

test("repro18: component fields and inline labels preserve placement", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board>
      <chip
        name="J_UART"
        manufacturerPartNumber="A_2_54_1_3P_"
        footprint="pinrow3_p2.54"
        pinLabels={{ pin1: "1", pin2: "2", pin3: "3" }}
        schPinArrangement={{
          leftSide: {
            direction: "top-to-bottom",
            pins: [1, 2],
          },
          rightSide: {
            direction: "top-to-bottom",
            pins: [3],
          },
        }}
      />
      <trace from=".J_UART > .pin1" to="net.ESP_RX" />
      <trace from=".J_UART > .pin2" to="net.ESP_TX" />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const inlineNetLabels = circuitJson.filter(
    (element): element is InlineNetLabel =>
      element.type === "schematic_text" &&
      "source_trace_id" in element &&
      typeof element.source_trace_id === "string",
  )
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const parsedSchematic = parseKicadSch(output)

  expect(output).toContain("(fields_autoplaced no)")
  expect(output).not.toContain("(fields_autoplaced yes)")
  expect(inlineNetLabels).toHaveLength(2)

  const componentSymbol = parsedSchematic.symbols.find((symbol) =>
    symbol.properties.some(
      (property) => property.key === "Reference" && property.value === "J_UART",
    ),
  )
  const manufacturerPartNumber = componentSymbol?.properties.find(
    (property) => property.key === "Value",
  )
  expect(manufacturerPartNumber?.value).toBe("A_2_54_1_3P_")
  expect(manufacturerPartNumber?.effects?.justify?.horizontal).toBe("left")

  for (const inlineNetLabel of inlineNetLabels) {
    const convertedText = parsedSchematic.texts.find(
      (text) => text.value === inlineNetLabel.text,
    )
    const expectedPosition = applyToPoint(
      converter.ctx.c2kMatSch!,
      inlineNetLabel.position,
    )
    const expectedHorizontalJustification =
      inlineNetLabel.anchor === "left" || inlineNetLabel.anchor === "right"
        ? inlineNetLabel.anchor
        : undefined
    expect(convertedText?.effects?.justify?.horizontal).toBe(
      expectedHorizontalJustification,
    )
    expect(convertedText?.at?.x).toBeCloseTo(expectedPosition.x)
    expect(convertedText?.at?.y).toBeCloseTo(expectedPosition.y)
  }

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
  })
  expect(kicadSnapshot.exitCode).toBe(0)

  expect(
    stackSchematicCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({
        circuitJson,
        outputType: "schematic",
      }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
