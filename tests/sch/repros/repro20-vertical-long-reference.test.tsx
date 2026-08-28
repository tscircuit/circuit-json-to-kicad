import { expect, test } from "bun:test"
import { Circuit } from "tscircuit-latest"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro20: long references stay beside vertical resistors and capacitors", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board>
      <resistor
        name="R_GPIO0_PU"
        resistance="10k"
        symbolName="boxresistor"
        schRotation={270}
        schX={-2}
        schY={1.5}
      />
      <capacitor
        name="C_REG_OUT_BULK"
        capacitance="10uF"
        schRotation={270}
        schX={2}
        schY={1.5}
      />
      <resistor
        name="R1"
        resistance="10k"
        symbolName="boxresistor"
        schRotation={270}
        schX={-2}
        schY={-1.5}
      />
      <capacitor
        name="C1"
        capacitance="10uF"
        schRotation={270}
        schX={2}
        schY={-1.5}
      />
      <trace from=".R_GPIO0_PU > .pin1" to=".C_REG_OUT_BULK > .pin1" />
      <trace from=".R_GPIO0_PU > .pin2" to=".C_REG_OUT_BULK > .pin2" />
      <trace from=".R1 > .pin1" to=".C1 > .pin1" />
      <trace from=".R1 > .pin2" to=".C1 > .pin2" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const sourceTraces = circuitJson.filter(
    (element) => element.type === "source_trace",
  )
  expect(sourceTraces).toHaveLength(4)
  for (const trace of sourceTraces) {
    expect(trace.connected_source_port_ids).toHaveLength(2)
  }
  const components = circuitJson.filter(
    (element) => element.type === "source_component",
  )
  expect(components.map((component) => component.name)).toEqual([
    "R_GPIO0_PU",
    "C_REG_OUT_BULK",
    "R1",
    "C1",
  ])
  expect(
    circuitJson
      .filter((element) => element.type === "schematic_component")
      .map((component) => component.symbol_name),
  ).toEqual([
    "boxresistor_down",
    "capacitor_down",
    "boxresistor_down",
    "capacitor_down",
  ])
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  for (const component of components) {
    expect(output).toContain(`(property "Reference" "${component.name}"`)
  }
  const schematic = parseKicadSch(output)
  for (const symbol of schematic.symbols) {
    for (const key of ["Reference", "Value"]) {
      const property = symbol.properties.find(
        (property) => property.key === key,
      )
      expect(property?.effects?.justify?.horizontal).toBe("left")
      expect(property!.at!.x).toBeGreaterThan(symbol.at!.x)
    }
  }
  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
  })
  expect(kicadSnapshot.exitCode).toBe(0)
  await expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "schematic" }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 60_000)
