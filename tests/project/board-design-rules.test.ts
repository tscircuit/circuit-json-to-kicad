import { expect, test } from "bun:test"
import type { CircuitJson, PcbBoard } from "circuit-json"
import { CircuitJsonToKicadProConverter } from "lib/project/CircuitJsonToKicadProConverter"

test("CircuitJsonToKicadProConverter exports explicit board design rules", () => {
  const pcbBoard: PcbBoard = {
    type: "pcb_board",
    pcb_board_id: "board1",
    center: { x: 0, y: 0 },
    width: 20,
    height: 20,
    num_layers: 2,
    thickness: 1.6,
    material: "fr4",
    min_trace_width: 0.25,
    min_board_edge_clearance: 0.3,
    min_trace_to_pad_edge_clearance: 0.15,
  }

  const circuitJson: CircuitJson = [pcbBoard]

  const converter = new CircuitJsonToKicadProConverter(circuitJson, {
    projectName: "test_rules",
  })
  converter.runUntilFinished()

  const proString = converter.getOutputString()
  const proJson = JSON.parse(proString)

  const rules = proJson.board?.design_settings?.rules
  expect(rules).toBeDefined()
  expect(rules.min_track_width).toBe(0.25)
  expect(rules.min_copper_edge_clearance).toBe(0.3)
  expect(rules.min_clearance).toBe(0.15)
})
