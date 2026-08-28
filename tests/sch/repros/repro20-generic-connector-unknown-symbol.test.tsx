import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

test("repro20 generic connector has an embedded KiCad symbol", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="30mm" height="30mm">
      <connector
        name="J5"
        pinLabels={{
          pin1: "1",
          pin2: "2",
          pin3: "3",
          pin4: "4",
          pin5: "5",
          pin6: "6",
        }}
        manufacturerPartNumber="1729160"
        footprint="pinrow6"
        schWidth={0.5}
        schHeight={1.4}
        schPinArrangement={{
          leftSide: {
            direction: "top-to-bottom",
            pins: [1, 2, 3, 4, 5, 6],
          },
        }}
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const sourceConnector = circuitJson.find(
    (
      element,
    ): element is Extract<
      (typeof circuitJson)[number],
      { type: "source_component" }
    > => element.type === "source_component" && element.name === "J5",
  )

  expect(sourceConnector).toBeDefined()
  if (!sourceConnector) throw new Error("J5 source component was not created")

  const schematicConnector = circuitJson.find(
    (element) =>
      element.type === "schematic_component" &&
      element.source_component_id === sourceConnector.source_component_id,
  )

  expect(schematicConnector).toBeDefined()
  expect(
    schematicConnector?.type === "schematic_component"
      ? schematicConnector.symbol_name
      : undefined,
  ).toBeUndefined()

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const output = converter.getOutputString()
  await Bun.write(
    "./debug-output/repro20-generic-connector-unknown-symbol.kicad_sch",
    output,
  )

  expect(output).toContain('(symbol "Device:J_1729160"')

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
  ).toMatchPngSnapshot(import.meta.path)
})
