import { expect, test } from "bun:test"
import type { CircuitJson, PcbBoard } from "circuit-json"
import fixture from "tests/assets/nema34-board-edge-clearance.circuit.json"

test("the real NEMA34 fixture requests 0.20 mm global edge clearance", () => {
  const circuitJson = fixture as CircuitJson
  const board = circuitJson.find(
    (item) => item.type === "pcb_board",
  ) as PcbBoard
  expect(board.pcb_board_id).toBe("pcb_board_0")
  expect(board.min_board_edge_clearance).toBe(0.2)
  expect(board.min_trace_width).toBe(0.15)
  expect(circuitJson).toHaveLength(4)
})
