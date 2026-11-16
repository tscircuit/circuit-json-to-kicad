import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"
import { exportNativeSchematicNets } from "../../fixtures/export-native-schematic-nets"
import { readSchematicErc } from "../../fixtures/read-schematic-erc"

test("repro924: horizontal and vertical chipRef symbols preserve native KiCad connections", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board routingDisabled schTraceAutoLabelEnabled={false}>
      <chip
        name="U1"
        noSchematicRepresentation
        pinLabels={{ pin1: "anode", pin2: "cathode" }}
      />
      <schematicsymbol
        name="D1"
        chipRef=".U1"
        symbolName="diode_right"
        schX={-2}
        schY={1}
        connections={{ anode: "U1.anode", cathode: "U1.cathode" }}
      />
      <chip
        name="U2"
        noSchematicRepresentation
        pinLabels={{ pin1: "anode", pin2: "cathode" }}
      />
      <schematicsymbol
        name="D2"
        chipRef=".U2"
        symbolName="diode_down"
        schX={2}
        schY={0}
        connections={{ anode: "U2.anode", cathode: "U2.cathode" }}
      />
      <resistor name="R1" resistance="1k" schX={-2} schY={-2} />
      <trace from=".D1 > .anode" to=".R1 > .pin2" />
      <trace from=".D1 > .cathode" to=".D2 > .anode" />
      <trace from=".D2 > .cathode" to=".R1 > .pin1" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  expect(
    (await exportNativeSchematicNets(circuitJson))
      .map((net) => net.pins)
      .sort(),
  ).toEqual([
    ["D1.1", "R1.2"],
    ["D1.2", "D2.1"],
    ["D2.2", "R1.1"],
  ])

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  // The standalone export embeds its symbols without installing their libraries.
  // No electrical, dangling-wire, or off-grid violations are expected.
  expect(await readSchematicErc(converter.getOutputString())).toEqual([
    "lib_symbol_issues",
    "lib_symbol_issues",
    "lib_symbol_issues",
  ])
}, 30_000)
