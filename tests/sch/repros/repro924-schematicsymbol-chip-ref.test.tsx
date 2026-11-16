import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"
import { exportNativeSchematicNets } from "../../fixtures/export-native-schematic-nets"
import { readSchematicErc } from "../../fixtures/read-schematic-erc"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

const Example = () => (
  <board width="40mm" height="30mm" routingDisabled>
    <chip
      name="D1"
      manufacturerPartNumber="1N34A"
      footprint="axial_p7.62mm"
      noSchematicRepresentation
      pinLabels={{ pin1: "anode", pin2: "cathode" }}
      pcbX={0}
      pcbY={0}
      connections={{ pin1: "net.A", pin2: "net.B" }}
    />
    <schematicsymbol
      name="D1_SYM"
      chipRef=".D1"
      symbolName="diode_right"
      schX={0}
      schY={0}
      connections={{ anode: "D1.anode", cathode: "D1.cathode" }}
    />
    <resistor
      name="R1"
      resistance="1k"
      footprint="0402"
      pcbX={8}
      pcbY={0}
      schX={3}
      schY={0}
      connections={{ pin1: "net.B", pin2: "net.GND" }}
    />
  </board>
)

export default Example

test("repro924: schematicsymbol chipRef connections survive KiCad export", async () => {
  const circuit = new Circuit()
  circuit.add(<Example />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  await Bun.write(
    "./debug-output/repro924-schematicsymbol-chip-ref.kicad_sch",
    output,
  )

  expect(await exportNativeSchematicNets(circuitJson)).toEqual([
    { name: "/A", pins: ["D1_SYM.1"] },
    { name: "/B", pins: ["D1_SYM.2", "R1.1"] },
    { name: "GND", pins: ["R1.2"] },
  ])
  expect((await readSchematicErc(output)).sort()).toEqual([
    "isolated_pin_label",
    "lib_symbol_issues",
    "lib_symbol_issues",
    "lib_symbol_issues",
    "power_pin_not_driven",
    "unconnected_wire_endpoint",
  ])

  const snapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
  })
  expect(snapshot.exitCode).toBe(0)
  await expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "schematic" }),
      snapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 30_000)
