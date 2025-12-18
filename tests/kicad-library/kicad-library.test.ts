import { test, expect } from "bun:test"
import { CircuitJsonToKicadLibraryConverter } from "lib/kicad-library/CircuitJsonToKicadLibraryConverter"
import * as path from "node:path"

test("generates kicad library with symbols, footprints, and 3D model references", () => {
  const stepFilePath = path.resolve(
    __dirname,
    "../assets/SW_Push_1P1T_NO_CK_KMR2.step",
  )

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
      name: "R1",
      ftype: "simple_resistor",
    },
    {
      type: "schematic_component",
      schematic_component_id: "schematic_component_0",
      source_component_id: "source_component_0",
      center: { x: 0, y: 0 },
      rotation: 0,
      size: { width: 1, height: 0.5 },
    },
    {
      type: "pcb_component",
      pcb_component_id: "pcb_component_0",
      source_component_id: "source_component_0",
      center: { x: -5, y: 0 },
      width: 1.6,
      height: 0.8,
      rotation: 0,
      layer: "top",
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pcb_smtpad_0",
      pcb_component_id: "pcb_component_0",
      shape: "rect",
      x: -5.5,
      y: 0,
      width: 0.5,
      height: 0.6,
      layer: "top",
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pcb_smtpad_1",
      pcb_component_id: "pcb_component_0",
      shape: "rect",
      x: -4.5,
      y: 0,
      width: 0.5,
      height: 0.6,
      layer: "top",
    },
    {
      type: "source_component",
      source_component_id: "source_component_1",
      name: "U1",
      ftype: "simple_chip",
    },
    {
      type: "schematic_component",
      schematic_component_id: "schematic_component_1",
      source_component_id: "source_component_1",
      center: { x: 5, y: 0 },
      rotation: 0,
      size: { width: 2, height: 2 },
    },
    {
      type: "pcb_component",
      pcb_component_id: "pcb_component_1",
      source_component_id: "source_component_1",
      center: { x: 5, y: 0 },
      width: 5,
      height: 5,
      rotation: 0,
      layer: "top",
    },
    {
      type: "cad_component",
      cad_component_id: "cad_component_0",
      pcb_component_id: "pcb_component_1",
      source_component_id: "source_component_1",
      position: { x: 5, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      model_step_url: stepFilePath,
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pcb_smtpad_2",
      pcb_component_id: "pcb_component_1",
      shape: "rect",
      x: 3,
      y: 0,
      width: 0.5,
      height: 0.6,
      layer: "top",
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pcb_smtpad_3",
      pcb_component_id: "pcb_component_1",
      shape: "rect",
      x: 7,
      y: 0,
      width: 0.5,
      height: 0.6,
      layer: "top",
    },
  ] as any

  const converter = new CircuitJsonToKicadLibraryConverter(circuitJson, {
    libraryName: "my_library",
    footprintLibraryName: "my_library",
  })
  converter.runUntilFinished()

  const output = converter.getOutput()

  // Verify symbol library
  expect(output.kicadSymString).toContain("kicad_symbol_lib")
  expect(output.kicadSymString).toContain("version")

  // Verify footprints
  expect(output.footprints.length).toBeGreaterThanOrEqual(2)
  const chipFootprint = output.footprints.find((fp) =>
    fp.footprintName.includes("chip"),
  )
  expect(chipFootprint).toBeDefined()
  expect(chipFootprint!.kicadModString).toContain("footprint")
  expect(chipFootprint!.kicadModString).toContain("pad")

  // Verify 3D model reference in footprint
  expect(chipFootprint!.kicadModString).toContain("(model")
  expect(chipFootprint!.kicadModString).toContain("my_library.3dshapes")
  expect(chipFootprint!.kicadModString).toContain(
    "SW_Push_1P1T_NO_CK_KMR2.step",
  )

  // Verify model 3D source paths list
  expect(output.model3dSourcePaths.length).toBeGreaterThan(0)
  expect(output.model3dSourcePaths[0]).toContain("SW_Push_1P1T_NO_CK_KMR2.step")

  // Verify library tables
  expect(output.fpLibTableString).toContain("fp_lib_table")
  expect(output.fpLibTableString).toContain("my_library")
  expect(output.symLibTableString).toContain("sym_lib_table")
  expect(output.symLibTableString).toContain("my_library")
})
