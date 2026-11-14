import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"
import { exportNativeSchematicNets } from "../fixtures/export-native-schematic-nets"
import { readSchematicErc } from "../fixtures/read-schematic-erc"

const rotation = 0

test(`built-in resistor, capacitor, and chip pins are on grid at ${rotation} degrees`, async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board routingDisabled>
      <resistor
        name="R1"
        resistance="1k"
        schX={-3}
        schRotation={rotation}
        pinAttributes={{
          pin1: { doNotConnect: true },
          pin2: { doNotConnect: true },
        }}
      />
      <capacitor
        name="C1"
        capacitance="100nF"
        pinAttributes={{
          pin1: { doNotConnect: true },
          pin2: { doNotConnect: true },
        }}
        schX={3}
        schRotation={rotation}
      />
      <chip
        name="U1"
        noConnect={["A", "B", "C", "D"]}
        schY={3}
        schRotation={rotation}
        pinLabels={{ pin1: "A", pin2: "B", pin3: "C", pin4: "D" }}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  expect(
    circuitJson.some((element) => element.type === "schematic_symbol"),
  ).toBe(false)
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  expect(converter.ctx.schematicConnectionGrid).toBeDefined()
  expect(
    (await readSchematicErc(converter.getOutputString())).filter(
      (type) => type !== "lib_symbol_issues",
    ),
  ).toEqual([])
  expect(
    (await exportNativeSchematicNets(circuitJson))
      .flatMap((net) => net.pins)
      .sort(),
  ).toEqual(["C1.1", "C1.2", "R1.1", "R1.2", "U1.1", "U1.2", "U1.3", "U1.4"])
  const snapshot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "sch",
  })
  await expect(
    snapshot.generatedFileContent["temp_file.png"]!,
  ).toMatchPngSnapshot(import.meta.path)
}, 30_000)
