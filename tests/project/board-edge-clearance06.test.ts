import { expect, test } from "bun:test"
import type { CircuitJson, PcbBoard } from "circuit-json"
import { CircuitJsonToKicadProConverter } from "lib/project/CircuitJsonToKicadProConverter"
import fixture from "tests/assets/nema34-board-edge-clearance.circuit.json"

test("preserves an explicit 0.35 mm edge clearance", () => {
  const edgeClearance = 0.35
  const circuitJson = structuredClone(fixture) as CircuitJson
  const board = circuitJson.find(
    (item) => item.type === "pcb_board",
  ) as PcbBoard
  board.min_board_edge_clearance = edgeClearance
  const project = new CircuitJsonToKicadProConverter(circuitJson).getOutput()
  expect(project.board.design_settings.rules).toHaveProperty(
    "min_copper_edge_clearance",
    edgeClearance,
  )
})
