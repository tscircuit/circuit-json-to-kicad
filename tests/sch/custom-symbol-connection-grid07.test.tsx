import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { ConnectionGridBox } from "../fixtures/connection-grid-boxes"
import { exportNativeSchematicNets } from "../fixtures/export-native-schematic-nets"
import { readSchematicErc } from "../fixtures/read-schematic-erc"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"

test("independent pin rows share grid rows without merging nets or enlarging bodies", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board routingDisabled schTraceAutoLabelEnabled={false}>
      <chip
        name="U1"
        schX={-4}
        symbol={<ConnectionGridBox side="right" spacing={0.05} height={0.17} />}
      />
      <chip
        name="U2"
        schX={-2}
        symbol={<ConnectionGridBox side="left" spacing={0.05} height={0.17} />}
      />
      <chip
        name="U3"
        schX={2}
        symbol={<ConnectionGridBox side="right" spacing={0.02} height={0.17} />}
      />
      <chip
        name="U4"
        schX={4}
        symbol={<ConnectionGridBox side="left" spacing={0.02} height={0.17} />}
      />
      <trace name="A" from="U1.pin1" to="U2.pin1" />
      <trace name="B" from="U1.pin2" to="U2.pin2" />
      <trace name="C" from="U3.pin1" to="U4.pin1" />
      <trace name="D" from="U3.pin2" to="U4.pin2" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  for (const symbol of converter.getOutput().libSymbols!.symbols) {
    const body = symbol.subSymbols.flatMap((unit) => unit.rectangles)[0]!
    expect(body.getString()).toContain("(start -7.5 -1.275)")
    expect(body.getString()).toContain("(end 7.5 1.275)")
  }
  expect(
    (await exportNativeSchematicNets(circuitJson))
      .map((net) => net.pins)
      .sort(),
  ).toEqual([
    ["U1.1", "U2.1"],
    ["U1.2", "U2.2"],
    ["U3.1", "U4.1"],
    ["U3.2", "U4.2"],
  ])
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
