import { expect, test } from "bun:test"
import { CircuitJsonToKicadProConverter } from "lib"
import { createBoardDesignRulesCircuit } from "../fixtures/create-board-design-rules-circuit"

test("preserves explicit edge limits, including zero, and omits absent limits", async () => {
  for (const edge of [0, 0.3, 0.5, undefined]) {
    const circuitJson = await createBoardDesignRulesCircuit(edge)
    const board = circuitJson.find((element) => element.type === "pcb_board")!
    // Current tscircuit supplies a default. Older/imported Circuit JSON may
    // omit this optional field, so remove it explicitly for the absence case.
    if (edge === undefined) delete board.min_board_edge_clearance
    expect(board.min_trace_width).toBe(0.25)
    expect(board.min_board_edge_clearance).toBe(edge)

    const converter = new CircuitJsonToKicadProConverter(circuitJson)
    const project = JSON.parse(converter.getOutputString())
    expect(project.board.design_settings.rules.min_track_width).toBe(0.25)
    if (edge === undefined) {
      expect(project.board.design_settings.rules).not.toHaveProperty(
        "min_copper_edge_clearance",
      )
    } else {
      expect(
        project.board.design_settings.rules.min_copper_edge_clearance,
      ).toBe(edge)
    }
  }

  const emptyProject = JSON.parse(
    new CircuitJsonToKicadProConverter([]).getOutputString(),
  )
  expect(emptyProject.board.design_settings.rules).not.toHaveProperty(
    "min_copper_edge_clearance",
  )
})
