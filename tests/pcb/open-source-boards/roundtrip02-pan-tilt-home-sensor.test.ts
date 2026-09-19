import { expect, test } from "bun:test"
import { createOpenSourceBoardRoundTrip } from "../../fixtures/create-open-source-board-round-trip"
import { expectOpenSourceSvgSnapshot } from "../../fixtures/create-open-source-schematic-svg-snapshot"

function createRotatedBoardPanel(
  svg: string,
  comparison: "source" | "converted",
  x: number,
): string {
  const normalizedSvg = svg
    .replace(
      / date \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2} /gu,
      " date normalized ",
    )
    .replace(/[ \t]+$/gmu, "")
  const viewBox = normalizedSvg.match(
    /\bviewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/u,
  )
  const rootStart = normalizedSvg.indexOf("<svg")
  const rootEnd = normalizedSvg.indexOf(">", rootStart)
  const closingTag = normalizedSvg.lastIndexOf("</svg>")
  if (!viewBox || rootStart === -1 || rootEnd === -1 || closingTag === -1) {
    throw new Error("Expected a complete board SVG with a numeric viewBox")
  }

  const width = Number(viewBox[1])
  const height = Number(viewBox[2])
  const body = normalizedSvg.slice(rootEnd + 1, closingTag)
  return `<svg data-comparison="${comparison}" x="${x}" y="100" width="600" height="350" viewBox="0 0 ${height} ${width}" preserveAspectRatio="xMidYMid meet">
<g transform="translate(${height} 0) rotate(90)">
${body}
</g>
</svg>`
}

test("repro4948: Pan-Tilt Home Sensor loses assembly exclusions on export", async () => {
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

  expect(result.sourceAssemblyExclusionCounts).toEqual({
    excludedFromBom: 6,
    excludedFromPositionFiles: 4,
  })
  expect(result.roundTripAssemblyExclusionCounts).toEqual({
    excludedFromBom: 0,
    excludedFromPositionFiles: 0,
  })

  const sourceCounts = result.sourceAssemblyExclusionCounts
  const roundTripCounts = result.roundTripAssemblyExclusionCounts
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="450" viewBox="0 0 1200 450">
<rect width="100%" height="100%" fill="#101820"/>
<line x1="600" y1="0" x2="600" y2="450" stroke="#5d6873" stroke-width="2"/>
<g font-family="sans-serif">
<text x="18" y="28" fill="white" font-size="20">Pan-Tilt Home Sensor — original KiCad</text>
<text x="618" y="28" fill="white" font-size="20">Current KiCad round trip</text>
<text x="18" y="54" fill="#8fd6a7" font-size="16">${sourceCounts.excludedFromBom} footprints excluded from BOM</text>
<text x="618" y="54" fill="#ff9b9b" font-size="16">${roundTripCounts.excludedFromBom} footprints excluded from BOM</text>
<text x="18" y="76" fill="#8fd6a7" font-size="16">${sourceCounts.excludedFromPositionFiles} footprints excluded from position files</text>
<text x="618" y="76" fill="#ff9b9b" font-size="16">${roundTripCounts.excludedFromPositionFiles} footprints excluded from position files</text>
</g>
${createRotatedBoardPanel(result.sourceSvg, "source", 0)}
${createRotatedBoardPanel(result.roundTripSvg, "converted", 600)}
</svg>`
  await expectOpenSourceSvgSnapshot(svg, import.meta.path)
})
