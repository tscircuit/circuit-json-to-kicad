import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../fixtures/stackCircuitJsonKicadPngs"

/**
 * This test demonstrates custom symbol support by:
 * 1. Creating a chip component using tscircuit
 * 2. Modifying the circuit JSON to inject custom symbol primitives
 *    (simulating what tscircuit will do when upstream support lands)
 * 3. Generating a KiCad schematic with the custom symbol
 */
test("custom-symbol04: NPN transistor with custom symbol (snapshot)", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="10mm">
      <chip
        name="Q1"
        pinLabels={{
          pin1: "B",
          pin2: "C",
          pin3: "E",
        }}
        schPortArrangement={{
          leftSide: {
            pins: [1],
            direction: "top-to-bottom",
          },
          topSide: {
            pins: [2],
            direction: "left-to-right",
          },
          bottomSide: {
            pins: [3],
            direction: "left-to-right",
          },
        }}
        footprint="sot23"
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson() as any[]

  // Find the schematic_component for Q1
  const schematicComponent = circuitJson.find(
    (el) =>
      el.type === "schematic_component" &&
      circuitJson.find(
        (sc) =>
          sc.type === "source_component" &&
          sc.source_component_id === el.source_component_id &&
          sc.name === "Q1",
      ),
  )

  if (!schematicComponent) {
    throw new Error("Could not find schematic_component for Q1")
  }

  const schematicSymbolId = "schematic_symbol_npn_custom_1"

  // Inject the schematic_symbol element (simulating upstream support)
  const customSymbol = {
    type: "schematic_symbol",
    schematic_symbol_id: schematicSymbolId,
    name: "npn_transistor_custom",
    center: { x: 0, y: 0 },
    size: { width: 1.4, height: 2 },
  }

  // Inject schematic primitives for the NPN transistor symbol
  // All coordinates are relative to the symbol center
  const symbolPrimitives = [
    // Outer circle
    {
      type: "schematic_circle",
      schematic_circle_id: "custom_circle_1",
      schematic_symbol_id: schematicSymbolId,
      center: { x: 0.1, y: 0 },
      radius: 0.55,
      stroke_width: 0.05,
      color: "#000000",
      is_filled: false,
      is_dashed: false,
    },

    // Base vertical bar
    {
      type: "schematic_line",
      schematic_line_id: "custom_line_1",
      schematic_symbol_id: schematicSymbolId,
      x1: -0.1,
      y1: -0.35,
      x2: -0.1,
      y2: 0.35,
      stroke_width: 0.05,
      color: "#000000",
      is_dashed: false,
    },

    // Base input line (horizontal)
    {
      type: "schematic_line",
      schematic_line_id: "custom_line_2",
      schematic_symbol_id: schematicSymbolId,
      x1: -0.55,
      y1: 0,
      x2: -0.1,
      y2: 0,
      stroke_width: 0.05,
      color: "#000000",
      is_dashed: false,
    },

    // Collector line (diagonal from base bar to top-right)
    {
      type: "schematic_line",
      schematic_line_id: "custom_line_3",
      schematic_symbol_id: schematicSymbolId,
      x1: -0.1,
      y1: 0.15,
      x2: 0.25,
      y2: 0.4,
      stroke_width: 0.05,
      color: "#000000",
      is_dashed: false,
    },

    // Collector line (vertical up)
    {
      type: "schematic_line",
      schematic_line_id: "custom_line_4",
      schematic_symbol_id: schematicSymbolId,
      x1: 0.25,
      y1: 0.4,
      x2: 0.25,
      y2: 0.7,
      stroke_width: 0.05,
      color: "#000000",
      is_dashed: false,
    },

    // Emitter line (diagonal from base bar to bottom-right)
    {
      type: "schematic_line",
      schematic_line_id: "custom_line_5",
      schematic_symbol_id: schematicSymbolId,
      x1: -0.1,
      y1: -0.15,
      x2: 0.25,
      y2: -0.4,
      stroke_width: 0.05,
      color: "#000000",
      is_dashed: false,
    },

    // Emitter line (vertical down)
    {
      type: "schematic_line",
      schematic_line_id: "custom_line_6",
      schematic_symbol_id: schematicSymbolId,
      x1: 0.25,
      y1: -0.4,
      x2: 0.25,
      y2: -0.7,
      stroke_width: 0.05,
      color: "#000000",
      is_dashed: false,
    },

    // Emitter arrow (V shape pointing outward)
    {
      type: "schematic_path",
      schematic_path_id: "custom_path_1",
      schematic_symbol_id: schematicSymbolId,
      points: [
        { x: 0.08, y: -0.22 },
        { x: 0.15, y: -0.32 },
        { x: 0.02, y: -0.35 },
      ],
      is_filled: false,
    },
  ]

  // Find and modify schematic_port elements to add schematic_symbol_id
  const schematicPorts = circuitJson.filter(
    (el) =>
      el.type === "schematic_port" &&
      el.schematic_component_id === schematicComponent.schematic_component_id,
  )

  for (const port of schematicPorts) {
    port.schematic_symbol_id = schematicSymbolId
  }

  // Link the schematic_component to the custom symbol
  schematicComponent.schematic_symbol_id = schematicSymbolId

  // Add the custom symbol and primitives to the circuit JSON
  const modifiedCircuitJson = [
    ...circuitJson,
    customSymbol,
    ...symbolPrimitives,
  ]

  // Write debug output
  await Bun.write(
    "./debug-output/custom-symbol-circuit.json",
    JSON.stringify(modifiedCircuitJson, null, 2),
  )

  const converter = new CircuitJsonToKicadSchConverter(modifiedCircuitJson)
  converter.runUntilFinished()

  const kicadOutput = converter.getOutputString()
  await Bun.write("./debug-output/custom-symbol.kicad_sch", kicadOutput)

  // Verify the custom symbol appears in the output
  expect(kicadOutput).toContain("npn_transistor_custom")
  expect(kicadOutput).toContain("Custom:npn_transistor_custom")
  expect(kicadOutput).toContain("polyline") // Lines converted to polylines
  expect(kicadOutput).toContain("circle") // Circle should be present

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: kicadOutput,
    kicadFileType: "sch",
  })

  expect(kicadSnapshot.exitCode).toBe(0)

  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({
        circuitJson: modifiedCircuitJson,
        outputType: "schematic",
      }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
