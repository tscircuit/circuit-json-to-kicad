import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit-latest"
import { exportNativeSchematicNets } from "../../fixtures/export-native-schematic-nets"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro27: inline SIGNAL text leaves two resistor pins disconnected in KiCad", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm" routingDisabled schMaxTraceDistance={1}>
      <resistor name="R1" resistance="1k" footprint="0402" schX={-1.5} />
      <resistor name="R2" resistance="1k" footprint="0402" schX={1.5} />
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

  // Capture the current bug: matching SIGNAL text does not connect the pins.
  const nets = await exportNativeSchematicNets(circuitJson)
  const signalNets = nets.filter(
    (net) => net.pins.includes("R1.2") || net.pins.includes("R2.1"),
  )
  expect(signalNets).toEqual([
    { name: "unconnected-(R1-Pad2)", pins: ["R1.2"] },
    { name: "unconnected-(R2-Pad1)", pins: ["R2.1"] },
  ])

  const snapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
  })
  await expect(
    snapshot.generatedFileContent["temp_file.png"]!,
  ).toMatchPngSnapshot(import.meta.path)
}, 30_000)
