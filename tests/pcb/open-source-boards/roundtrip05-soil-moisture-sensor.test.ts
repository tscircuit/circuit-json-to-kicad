import { expect, test } from "bun:test"
import { createOpenSourceBoardRoundTrip } from "../../fixtures/create-open-source-board-round-trip"
import { expectOpenSourceSvgSnapshot } from "../../fixtures/create-open-source-schematic-svg-snapshot"

test("round-trips the open-source soil moisture sensor KiCad board", async () => {
  const result = await createOpenSourceBoardRoundTrip({
    boardName: "Capacitive Soil Moisture Sensor",
    filename: "soil-moisture-sensor.kicad_pcb",
  })

  expect(result.roundTripCounts).toEqual(result.sourceCounts)
  expect(result.roundTripEdgeCutsWidth).toBe(result.sourceEdgeCutsWidth)
  expect(result.roundTripNetNames).toEqual(result.sourceNetNames)
  expect(result.sourceWarnings).toEqual([])
  expect(result.roundTripWarnings).toEqual([])
  expect(result.sourcePrimitiveTotal).toBeGreaterThan(250)
  expect(result.comparisonPng).toMatchPngSnapshot(import.meta.path)
  await expectOpenSourceSvgSnapshot(
    result.comparisonSvg,
    import.meta.path,
  )
})
