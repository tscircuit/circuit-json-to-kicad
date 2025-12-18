import { test, expect } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("footprint includes 3D model from cad_component", () => {
  const circuitJson = [
    {
      type: "pcb_board",
      pcb_board_id: "pcb_board_0",
      width: 20,
      height: 20,
      center: { x: 0, y: 0 },
    },
    {
      type: "source_component",
      source_component_id: "source_component_0",
      name: "U1",
      ftype: "simple_chip",
    },
    {
      type: "pcb_component",
      pcb_component_id: "pcb_component_0",
      source_component_id: "source_component_0",
      center: { x: 0, y: 0 },
      width: 5,
      height: 5,
      rotation: 0,
      layer: "top",
    },
    {
      type: "cad_component",
      cad_component_id: "cad_component_0",
      pcb_component_id: "pcb_component_0",
      source_component_id: "source_component_0",
      position: { x: 0, y: 0, z: 1.0 },
      rotation: { x: 0, y: 0, z: 90 },
      model_step_url: "${KIPRJMOD}/3dmodels/chip.step",
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pcb_smtpad_0",
      pcb_component_id: "pcb_component_0",
      shape: "rect",
      x: -2,
      y: 0,
      width: 0.5,
      height: 0.6,
      layer: "top",
    },
  ] as any

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const output = converter.getOutputString()

  // Verify the output contains model with offset and rotation
  expect(output).toContain("(model")
  expect(output).toContain("chip.step")
  expect(output).toContain("(offset")
  expect(output).toContain("(rotate")
})
