import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadProConverter } from "lib/project/CircuitJsonToKicadProConverter"
import fixture from "tests/assets/nema34-board-edge-clearance.circuit.json"
import { runNema34BoardEdgeDrc } from "tests/fixtures/run-nema34-board-edge-drc"

test("KiCad's missing-rule control reports the unintended 0.50 mm limit", async () => {
  const circuitJson = fixture as CircuitJson
  const project = new CircuitJsonToKicadProConverter(circuitJson, {
    projectName: "nema34",
  }).getOutput()
  delete project.board.design_settings.rules.min_copper_edge_clearance
  const missingRuleErrors = await runNema34BoardEdgeDrc(project, "missing-rule")
  expect(missingRuleErrors.length).toBeGreaterThan(0)
  expect(
    missingRuleErrors.some((item) => item.description.includes("0.5000 mm")),
  ).toBe(true)
}, 30_000)
