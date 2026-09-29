import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

const board = {
  type: "pcb_board",
  pcb_board_id: "pcb_board_1",
  width: 20,
  height: 20,
  center: { x: 0, y: 0 },
}

test("repro #585: component footprints retain physical pad types in board output", () => {
  const circuitJson = [
    board,
    {
      type: "source_component",
      source_component_id: "source_component_smd",
      name: "R1",
      ftype: "simple_resistor",
    },
    {
      type: "pcb_component",
      pcb_component_id: "pcb_component_smd",
      source_component_id: "source_component_smd",
      center: { x: -3, y: 0 },
      width: 2,
      height: 1,
      rotation: 0,
      layer: "top",
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pcb_smtpad_1",
      pcb_component_id: "pcb_component_smd",
      shape: "rect",
      x: -3,
      y: 0,
      width: 1,
      height: 1,
      layer: "top",
    },
    {
      type: "source_component",
      source_component_id: "source_component_tht",
      name: "J1",
      ftype: "simple_pin_header",
    },
    {
      type: "pcb_component",
      pcb_component_id: "pcb_component_tht",
      source_component_id: "source_component_tht",
      center: { x: 3, y: 0 },
      width: 2,
      height: 2,
      rotation: 0,
      layer: "top",
    },
    {
      type: "pcb_plated_hole",
      pcb_plated_hole_id: "pcb_plated_hole_1",
      pcb_component_id: "pcb_component_tht",
      shape: "circle",
      x: 3,
      y: 0,
      hole_diameter: 0.7,
      outer_diameter: 1.4,
      layers: ["top", "bottom"],
    },
  ] as CircuitJson

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const boardOutput = KicadPcb.parse(converter.getOutputString())[0] as KicadPcb

  expect(boardOutput.footprints).toHaveLength(2)
  const attributesByPadType = Object.fromEntries(
    boardOutput.footprints.map((footprint) => [
      footprint.fpPads[0]?.padType,
      footprint.attr?.type,
    ]),
  )
  expect(attributesByPadType).toEqual({
    smd: "smd",
    thru_hole: "through_hole",
  })
})

test("repro #585: standalone pads retain physical pad types in board output", () => {
  const circuitJson = [
    board,
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pcb_smtpad_standalone",
      shape: "rect",
      x: -3,
      y: 0,
      width: 1,
      height: 1,
      layer: "top",
    },
    {
      type: "pcb_plated_hole",
      pcb_plated_hole_id: "pcb_plated_hole_standalone",
      shape: "circle",
      x: 3,
      y: 0,
      hole_diameter: 0.7,
      outer_diameter: 1.4,
      layers: ["top", "bottom"],
    },
  ] as CircuitJson

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const boardOutput = KicadPcb.parse(converter.getOutputString())[0] as KicadPcb

  expect(boardOutput.footprints).toHaveLength(2)
  const attributesByPadType = Object.fromEntries(
    boardOutput.footprints.map((footprint) => [
      footprint.fpPads[0]?.padType,
      footprint.attr?.type,
    ]),
  )
  expect(attributesByPadType).toEqual({
    smd: "smd",
    thru_hole: "through_hole",
  })
})
