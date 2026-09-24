import { expect, test } from "bun:test"
import { createOpenSourceBoardRoundTrip } from "../../fixtures/create-open-source-board-round-trip"
import { expectOpenSourceSvgSnapshot } from "../../fixtures/create-open-source-schematic-svg-snapshot"

function createBoardPanel(
  svg: string,
  comparison: "source" | "converted",
  y: number,
): string {
  const normalizedSvg = svg
    .replace(
      / date \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2} /gu,
      " date normalized ",
    )
    .replace(/[ \t]+$/gmu, "")
  const viewBox = normalizedSvg.match(
    /\bviewBox="([\d.-]+ [\d.-]+ [\d.]+ [\d.]+)"/u,
  )
  const rootStart = normalizedSvg.indexOf("<svg")
  const rootEnd = normalizedSvg.indexOf(">", rootStart)
  const closingTag = normalizedSvg.lastIndexOf("</svg>")
  if (!viewBox || rootStart === -1 || rootEnd === -1 || closingTag === -1) {
    throw new Error("Expected a complete board SVG with a numeric viewBox")
  }

  const body = normalizedSvg.slice(rootEnd + 1, closingTag)
  return `<svg data-comparison="${comparison}" x="0" y="${y}" width="1200" height="175" viewBox="${viewBox[1]}" preserveAspectRatio="xMidYMid meet">
${body}
</svg>`
}

function normalizeRotation(rotation: number): number {
  return ((rotation % 360) + 360) % 360
}

test("repro4948: Soil Moisture Sensor changes rotated bottom transforms on export", async () => {
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

  const sourceBottomTransforms = result.sourceFootprintTransforms.filter(
    (transform) => transform.layer === "bottom",
  )
  const roundTripBottomTransforms = result.roundTripFootprintTransforms.filter(
    (transform) => transform.layer === "bottom",
  )
  expect(sourceBottomTransforms).toHaveLength(14)
  expect(roundTripBottomTransforms).toHaveLength(14)

  const changedRotations = sourceBottomTransforms.flatMap((source) => {
    const roundTrip = roundTripBottomTransforms.find(
      (candidate) => candidate.reference === source.reference,
    )
    if (
      !roundTrip ||
      normalizeRotation(roundTrip.rotation) ===
        normalizeRotation(source.rotation)
    ) {
      return []
    }
    return [
      {
        reference: source.reference,
        roundTripRotation: roundTrip.rotation,
        sourceRotation: source.rotation,
      },
    ]
  })
  expect(changedRotations).toEqual([
    { reference: "U1", roundTripRotation: -135, sourceRotation: 135 },
    { reference: "U3", roundTripRotation: -90, sourceRotation: 90 },
    { reference: "Y1", roundTripRotation: -45, sourceRotation: 45 },
  ])

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="500" viewBox="0 0 1200 500">
<rect width="100%" height="100%" fill="#101820"/>
<line x1="0" y1="250" x2="1200" y2="250" stroke="#5d6873" stroke-width="2"/>
<g font-family="sans-serif">
<text x="18" y="28" fill="white" font-size="20">Soil Moisture Sensor — original KiCad</text>
<text x="18" y="52" fill="#8fd6a7" font-size="16">${sourceBottomTransforms.length} bottom-side footprints</text>
<text x="18" y="278" fill="white" font-size="20">Current KiCad round trip</text>
<text x="18" y="302" fill="#ff9b9b" font-size="16">${changedRotations.length} bottom footprint rotations changed</text>
</g>
${createBoardPanel(result.sourceSvg, "source", 65)}
${createBoardPanel(result.roundTripSvg, "converted", 315)}
</svg>`
  await expectOpenSourceSvgSnapshot(svg, import.meta.path)
})
