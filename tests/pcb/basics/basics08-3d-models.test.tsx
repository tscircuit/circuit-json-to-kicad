import { test, expect } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("pcb 3d models - adds FootprintModel from cad_component", async () => {
  // Create a minimal circuit JSON with a cad_component that has 3D model info
  const circuitJson = [
    {
      type: "pcb_board",
      pcb_board_id: "pcb_board_1",
      center: { x: 0, y: 0 },
      width: 10,
      height: 10,
      thickness: 1.6,
      num_layers: 2,
      material: "fr4",
    },
    {
      type: "source_component",
      source_component_id: "source_component_1",
      name: "R1",
      ftype: "simple_resistor",
      resistance: 1000,
    },
    {
      type: "pcb_component",
      pcb_component_id: "pcb_component_1",
      source_component_id: "source_component_1",
      center: { x: 0, y: 0 },
      layer: "top",
      rotation: 0,
      width: 1,
      height: 0.5,
      obstructs_within_bounds: true,
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pcb_smtpad_1",
      pcb_component_id: "pcb_component_1",
      shape: "rect",
      x: -0.3,
      y: 0,
      width: 0.3,
      height: 0.3,
      layer: "top",
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pcb_smtpad_2",
      pcb_component_id: "pcb_component_1",
      shape: "rect",
      x: 0.3,
      y: 0,
      width: 0.3,
      height: 0.3,
      layer: "top",
    },
    {
      type: "cad_component",
      cad_component_id: "cad_component_1",
      pcb_component_id: "pcb_component_1",
      source_component_id: "source_component_1",
      position: { x: 0, y: 0, z: 0.5 },
      rotation: { x: 0, y: 0, z: 90 },
      model_step_url:
        "${KICAD8_3DMODEL_DIR}/Resistor_SMD.3dshapes/R_0402_1005Metric.step",
    },
  ] as const

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson as any)
  converter.runUntilFinished()

  const output = converter.getOutputString()

  // Verify the output contains the 3D model reference
  expect(output).toContain("(model")
  expect(output).toContain("R_0402_1005Metric.step")
  expect(output).toContain("(offset")
  expect(output).toContain("(rotate")

  // Write debug output
  Bun.write("./debug-output/3d-model-test.kicad_pcb", output)
})
