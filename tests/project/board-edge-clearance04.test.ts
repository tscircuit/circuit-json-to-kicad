import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadProConverter } from "lib/project/CircuitJsonToKicadProConverter"
import fixture from "tests/assets/nema34-board-edge-clearance.circuit.json"
import { runNema34BoardEdgeDrc } from "tests/fixtures/run-nema34-board-edge-drc"

test("the actual exported project has no false copper-edge errors", async () => {
  const circuitJson = fixture as CircuitJson
  const project = new CircuitJsonToKicadProConverter(circuitJson, {
    projectName: "nema34",
  }).getOutput()
  const exportedRuleErrors = await runNema34BoardEdgeDrc(
    project,
    "exported-rule",
  )
  expect(exportedRuleErrors).toEqual([])
}, 30_000)
