import { expect, test } from "bun:test"
import {
  createOpenSourceSchematicSvgSnapshots,
  expectOpenSourceSchematicSvgSnapshot,
} from "../../fixtures/create-open-source-schematic-svg-snapshot"

const sheets = [
  {
    outputFilename: "ebaz4205.svg",
    snapshotName: "root",
    sourceFilename: "ebaz4205.kicad_sch",
  },
  {
    outputFilename: "ebaz4205-IO Sheet.svg",
    snapshotName: "io",
    sourceFilename: "IO.kicad_sch",
  },
  {
    outputFilename: "ebaz4205-Mem & Zynq Sheet.svg",
    snapshotName: "memory-zynq",
    sourceFilename: "Mem_Zynq.kicad_sch",
  },
  {
    outputFilename: "ebaz4205-PHY & Sundries.svg",
    snapshotName: "phy-sun",
    sourceFilename: "Phy-Sun.kicad_sch",
  },
  {
    outputFilename: "ebaz4205-Zynq_IO Sheet.svg",
    snapshotName: "zynq-io",
    sourceFilename: "Zynq_IO.kicad_sch",
  },
  {
    outputFilename: "ebaz4205-Zynq Power Sheet.svg",
    snapshotName: "zynq-power",
    sourceFilename: "Zynq_Pwr.kicad_sch",
  },
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
    await expectOpenSourceSchematicSvgSnapshot(
      svg,
      import.meta.path,
      sheets[index]!.snapshotName,
    )
  }
}, 30_000)
