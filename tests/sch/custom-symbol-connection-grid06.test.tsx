import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { exportNativeSchematicNets } from "../fixtures/export-native-schematic-nets"
import { readSchematicErc } from "../fixtures/read-schematic-erc"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"
import { ConnectionGridBox } from "../fixtures/connection-grid-boxes"

test("diagonal routing preserves its connections on the KiCad grid", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  // Exercise authored diagonal wires through core's direct-line router.
  circuit._featureMspSchematicTraceRouting = false
  circuit.add(
    <board routingDisabled>
      <chip
        name="U1"
        noConnect={["pin2"]}
        schX={-2}
        symbol={<ConnectionGridBox side="right" spacing={0.4} />}
      />
      <chip
        name="U2"
        noConnect={["pin2"]}
        schX={2}
        schY={1}
        symbol={<ConnectionGridBox side="left" spacing={0.4} />}
      />
      <trace from="U1.pin1" to="U2.pin1" />
    </board>,
  )
  circuit._getBoard()!.props._schDirectLineRoutingEnabled = true
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadSchConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  expect(converter.getOutput().wires).toHaveLength(1)
  expect(
    (await exportNativeSchematicNets(circuit.getCircuitJson()))
      .filter((net) => net.pins.length > 1)
      .map((net) => net.pins),
  ).toEqual([["U1.1", "U2.1"]])
  expect(
    (await readSchematicErc(converter.getOutputString())).filter(
      (type) => type !== "lib_symbol_issues",
    ),
  ).toEqual([])
  const snapshot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "sch",
  })
  await expect(
    snapshot.generatedFileContent["temp_file.png"]!,
  ).toMatchPngSnapshot(import.meta.path)
}, 30_000)
