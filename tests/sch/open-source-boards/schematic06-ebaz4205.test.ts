import { expect, test } from "bun:test"
import {
  createOpenSourceSchematicSvgSnapshots,
  expectOpenSourceSchematicSvgSnapshot,
} from "../../fixtures/create-open-source-schematic-svg-snapshot"

const sheets = [
  {
    outputFilename: "ebaz4205.svg",
    pageNumber: 1,
    snapshotName: "root",
    sourceFilename: "ebaz4205.kicad_sch",
  },
  {
    outputFilename: "ebaz4205-IO Sheet.svg",
    pageNumber: 6,
    snapshotName: "io",
    sourceFilename: "IO.kicad_sch",
  },
  {
    outputFilename: "ebaz4205-Mem & Zynq Sheet.svg",
    pageNumber: 3,
    snapshotName: "memory-zynq",
    sourceFilename: "Mem_Zynq.kicad_sch",
  },
  {
    outputFilename: "ebaz4205-PHY & Sundries.svg",
    pageNumber: 2,
    snapshotName: "phy-sun",
    sourceFilename: "Phy-Sun.kicad_sch",
  },
  {
    outputFilename: "ebaz4205-Zynq_IO Sheet.svg",
    pageNumber: 4,
    snapshotName: "zynq-io",
    sourceFilename: "Zynq_IO.kicad_sch",
  },
  {
    outputFilename: "ebaz4205-Zynq Power Sheet.svg",
    pageNumber: 5,
    snapshotName: "zynq-power",
    sourceFilename: "Zynq_Pwr.kicad_sch",
  },
]

const titleBlockLabels = [
  "Date: 2021-02-15",
  "Rev: V004",
  "Title: EBAZ4205 Schematic rebuild.",
  "Some schematic symbols have been eeditted to clear DRC errors",
  "Extra PWR_FLAGS have been added to clear DRC errors",
  "Kicad does not allow refs like RxxxA some some devices have been renumbered",
]

test("renders every sheet of the open-source EBAZ4205 KiCad schematic", async () => {
  const exports = await createOpenSourceSchematicSvgSnapshots(
    "ebaz4205.kicad_sch",
    Object.fromEntries(
      sheets.map(({ outputFilename, sourceFilename }) => [
        outputFilename,
        sourceFilename,
      ]),
    ),
  )
  const svgs = sheets.map(({ outputFilename }) => {
    const svg = exports[outputFilename]
    if (!svg) throw new Error(`KiCad did not export ${outputFilename}`)
    return svg
  })
  for (const svg of svgs) expect(svg).toContain("<svg")
  for (const svg of svgs) {
    const convertedViewBox = svg.match(
      /<svg data-comparison="converted"[\s\S]*?viewBox="([^"]+)"/u,
    )?.[1]
    expect(convertedViewBox).toBe("0.0000 0.0000 419.9890 297.0022")
  }
  for (const [index, svg] of svgs.entries()) {
    const sourcePanel = svg.match(
      /<svg data-comparison="source"[\s\S]*?(?=<svg data-comparison="converted")/u,
    )?.[0]
    const convertedPanel = svg.match(
      /<svg data-comparison="converted"[\s\S]*$/u,
    )?.[0]
    expect(sourcePanel).toBeDefined()
    expect(convertedPanel).toBeDefined()
    for (const titleBlockLabel of titleBlockLabels) {
      expect(sourcePanel).toContain(titleBlockLabel)
      expect(convertedPanel).toContain(titleBlockLabel)
    }
    if (index > 0) {
      const expectedPageLabel = `Id: ${sheets[index]!.pageNumber}/${sheets.length}`
      expect(sourcePanel).toContain(expectedPageLabel)
      expect(convertedPanel).toContain(expectedPageLabel)
    }
    await expectOpenSourceSchematicSvgSnapshot(
      svg,
      import.meta.path,
      sheets[index]!.snapshotName,
    )
  }
}, 30_000)
