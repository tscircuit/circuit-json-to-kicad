import type { AnyCircuitElement } from "circuit-json"
import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("pcb basics06 - plated hole with hole offsets", async () => {
  const circuitJson: AnyCircuitElement[] = [
    {
      type: "pcb_board",
      pcb_board_id: "pcb_board_1",
      width: 20,
      height: 20,
      thickness: 1.6,
      num_layers: 2,
      material: "fr4",
      center: { x: 0, y: 0 },
      outline: [
        { x: -10, y: -10 },
        { x: 10, y: -10 },
        { x: 10, y: 10 },
        { x: -10, y: 10 },
      ],
    },
    {
      type: "pcb_component",
      pcb_component_id: "pcb_component_1",
      source_component_id: "source_component_1",
      center: { x: 0, y: 0 },
      width: 3,
      height: 3,
      layer: "top",
      rotation: 0,
      obstructs_within_bounds: false,
    },
    {
      type: "pcb_plated_hole",
      pcb_plated_hole_id: "plated_hole_1",
      pcb_component_id: "pcb_component_1",
      shape: "pill_hole_with_rect_pad",
      hole_shape: "pill",
      pad_shape: "rect",
      x: 0,
      y: 0,
      hole_width: 0.6,
      hole_height: 1.2,
      rect_pad_width: 1.6,
      rect_pad_height: 2.0,
      hole_offset_x: 0.3,
      hole_offset_y: 0.2,
      layers: ["top", "bottom"],
    },
  ]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)

  converter.runUntilFinished()

  const kicadOutput = converter.getOutputString()

  Bun.write("./debug-output/basics06-kicad.kicad_pcb", kicadOutput)
  Bun.write(
    "./debug-output/basics06-circuit.json",
    JSON.stringify(circuitJson, null, 2),
  )

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: kicadOutput,
    kicadFileType: "pcb",
  })

  expect(kicadSnapshot.exitCode).toBe(0)

  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
