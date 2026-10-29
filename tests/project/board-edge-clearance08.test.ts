import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadProConverter } from "lib/project/CircuitJsonToKicadProConverter"

test("omits edge clearance when the circuit has no PCB board", () => {
  const circuitJson: CircuitJson = []
  const project = new CircuitJsonToKicadProConverter(circuitJson).getOutput()
  expect(project.board.design_settings.rules).not.toHaveProperty(
    "min_copper_edge_clearance",
  )
})
