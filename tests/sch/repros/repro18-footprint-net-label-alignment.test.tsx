import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro18: footprint identifier overlaps net labels in KiCad", async () => {
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
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()

  expect(output).toContain("(fields_autoplaced no)")
  expect(output).not.toContain("(fields_autoplaced yes)")

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
  ).toMatchPngSnapshot(import.meta.path, "fixed-placement")
})
