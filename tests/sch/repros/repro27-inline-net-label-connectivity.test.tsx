import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"
import { exportNativeSchematicNets } from "../../fixtures/export-native-schematic-nets"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro27: inline SIGNAL labels connect two resistor pins in KiCad", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm" routingDisabled>
      <schematicsection name="first" />
      <schematicsection name="second" />
      <resistor
        name="R1"
        resistance="1k"
        footprint="0402"
        schX={-1.5}
        schSectionName="first"
      />
      <resistor
        name="R2"
        resistance="1k"
        footprint="0402"
        schX={1.5}
        schSectionName="second"
      />
      <trace from=".R1 > .pin2" to="net.SIGNAL" />
      <trace from=".R2 > .pin1" to="net.SIGNAL" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  expect(
    circuitJson.filter(
      (row) => row.type === "schematic_text" && row.text === "SIGNAL",
    ),
  ).toHaveLength(2)

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  await Bun.write(
    "./debug-output/repro27-inline-net-label-connectivity.kicad_sch",
    output,
  )

  // Matching words in the drawing are not enough: KiCad must connect the pins.
  const nets = await exportNativeSchematicNets(circuitJson)
  const signalNets = nets.filter(
    (net) => net.pins.includes("R1.2") || net.pins.includes("R2.1"),
  )
  expect(signalNets).toEqual([{ name: "/SIGNAL", pins: ["R1.2", "R2.1"] }])

  const snapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
  })
  await expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({
        circuitJson,
        outputType: "schematic",
      }),
      snapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 30_000)
