import { expect, test } from "bun:test"
import type { CircuitJson, PcbBoard } from "circuit-json"
import { CircuitJsonToKicadProConverter } from "lib/project/CircuitJsonToKicadProConverter"
import fixture from "tests/assets/nema34-board-edge-clearance.circuit.json"

test("leaves an unspecified edge clearance to KiCad", () => {
  const circuitJson = structuredClone(fixture) as CircuitJson
  const board = circuitJson.find(
    (item) => item.type === "pcb_board",
  ) as PcbBoard
  delete board.min_board_edge_clearance
  const project = new CircuitJsonToKicadProConverter(circuitJson).getOutput()
  expect(project.board.design_settings.rules).not.toHaveProperty(
    "min_copper_edge_clearance",
  )
})
