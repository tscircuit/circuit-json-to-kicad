import { expect, test } from "bun:test"
import { createOpenSourceBoardRoundTrip } from "../../fixtures/create-open-source-board-round-trip"

test("round-trips the open-source Pi Switcher Plus KiCad board", async () => {
  const result = await createOpenSourceBoardRoundTrip({
    boardName: "Pi Switcher Plus",
    filename: "pi-switcher-plus.kicad_pcb",
  })

  expect(result.roundTripCounts).toEqual(result.sourceCounts)
  expect(result.roundTripNetNames).toEqual(result.sourceNetNames)
  expect(result.sourceWarnings).toEqual([])
  expect(result.roundTripWarnings).toEqual([])
  expect(result.sourcePrimitiveTotal).toBeGreaterThan(500)
  expect(result.comparisonPng).toMatchPngSnapshot(import.meta.path)
})
