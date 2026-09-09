import { expect, test } from "bun:test"
import { createOpenSourceBoardRoundTrip } from "../../fixtures/create-open-source-board-round-trip"

test("round-trips the open-source pan-tilt sensor KiCad board", async () => {
  const result = await createOpenSourceBoardRoundTrip({
    boardName: "Pan-Tilt Home Sensor",
    filename: "pan-tilt-home-sensor.kicad_pcb",
  })

  expect(result.roundTripCounts).toEqual(result.sourceCounts)
  expect(result.roundTripNetNames).toEqual(result.sourceNetNames)
  expect(result.sourceWarnings).toEqual([])
  expect(result.roundTripWarnings).toEqual([])
  expect(result.sourcePrimitiveTotal).toBeGreaterThan(50)
  expect(result.comparisonPng).toMatchPngSnapshot(import.meta.path)
})
