import { expect, test } from "bun:test"
import { Circuit } from "tscircuit-latest"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import sharp from "sharp"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro21: generic connector instance has no embedded symbol definition", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board>
      <connector
        name="J3"
        pinLabels={{
          pin1: "3V3",
          pin2: "GND",
          pin3: "TX",
          pin4: "RX",
          pin5: "EN",
          pin6: "IO0",
        }}
        schPinArrangement={{
          leftSide: { direction: "top-to-bottom", pins: [1, 2, 3] },
          rightSide: { direction: "top-to-bottom", pins: [6, 5, 4] },
        }}
        schPinSpacing={0.8}
      />
      <resistor name="R1" resistance="10k" schX={-4} schY={0.8} />
      <resistor name="R2" resistance="10k" schX={4} schY={0.8} />
      <trace from=".J3 > .pin1" to=".R1 > .pin2" />
      <trace from=".R1 > .pin1" to=".J3 > .pin2" />
      <trace from=".J3 > .pin6" to=".R2 > .pin1" />
      <trace from=".R2 > .pin2" to=".J3 > .pin5" />
      <trace from=".J3 > .pin3" to=".J3 > .pin4" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const sourceTraces = circuitJson.filter(
    (element) => element.type === "source_trace",
  )
  expect(sourceTraces).toHaveLength(5)
  for (const trace of sourceTraces) {
    expect(trace.connected_source_port_ids).toHaveLength(2)
  }
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const schematic = parseKicadSch(output)
  const connector = schematic.symbols.find((symbol) =>
    symbol.properties.some(
      (property) => property.key === "Reference" && property.value === "J3",
    ),
  )
  expect(connector).toBeDefined()
  expect(connector!.pins).toHaveLength(6)
  const libraryId = connector!.libraryId
  expect(libraryId).toBeDefined()
  // Capture the existing defect: the instance references a missing library symbol.
  expect(schematic.libSymbols!.getString()).not.toContain(
    `(symbol "${libraryId}"`,
  )
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
    .resize(1200, 600, { fit: "contain", background: "#f5f1ed" })
    .png()
    .toBuffer()
  await expect(
    stackCircuitJsonKicadPngs(
      circuitJsonPng,
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 60_000)
