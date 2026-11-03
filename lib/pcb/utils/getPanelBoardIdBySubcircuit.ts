import type { CircuitJson } from "circuit-json"

/** Board namespaces for panel nets, including nets inside nested subcircuits. */
export const getPanelBoardIdBySubcircuit = (
  circuitJson: CircuitJson,
): Map<string, string> => {
  const boards = circuitJson.filter((element) => element.type === "pcb_board")
  const boardIdBySubcircuit = new Map<string, string>()
  if (boards.length < 2) return boardIdBySubcircuit

  for (const board of boards) {
    if (board.subcircuit_id) {
      boardIdBySubcircuit.set(board.subcircuit_id, board.pcb_board_id)
    }
  }

  const parentBySubcircuit = new Map<string, string>()
  for (const element of circuitJson) {
    if (
      element.type === "source_group" &&
      element.is_subcircuit &&
      element.subcircuit_id &&
      element.parent_subcircuit_id
    ) {
      parentBySubcircuit.set(
        element.subcircuit_id,
        element.parent_subcircuit_id,
      )
    }
  }

  for (const subcircuitId of parentBySubcircuit.keys()) {
    const visited = new Set<string>()
    let ancestor: string | undefined = subcircuitId
    while (ancestor && !visited.has(ancestor)) {
      const boardId = boardIdBySubcircuit.get(ancestor)
      if (boardId) {
        boardIdBySubcircuit.set(subcircuitId, boardId)
        break
      }
      visited.add(ancestor)
      ancestor = parentBySubcircuit.get(ancestor)
    }
  }

  return boardIdBySubcircuit
}
