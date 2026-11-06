import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadProConverter } from "lib/project/CircuitJsonToKicadProConverter"
import fixture from "tests/assets/nema34-board-edge-clearance.circuit.json"

test("preserves the real NEMA34 board's global edge clearance", () => {
  const circuitJson = fixture as CircuitJson
  const project = new CircuitJsonToKicadProConverter(circuitJson, {
    projectName: "nema34",
  }).getOutput()
  expect(project.board.design_settings.rules).toMatchObject({
    min_copper_edge_clearance: 0.2,
    min_track_width: 0.15,
  })
})
