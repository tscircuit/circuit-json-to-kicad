import { expect, test } from "bun:test"
import {
  createOpenSourceSchematicSvgSnapshots,
  expectOpenSourceSchematicSvgSnapshot,
} from "../../fixtures/create-open-source-schematic-svg-snapshot"

const sheets = [
  { outputFilename: "ebaz4205.svg", snapshotName: "root" },
  { outputFilename: "ebaz4205-IO Sheet.svg", snapshotName: "io" },
  {
    outputFilename: "ebaz4205-Mem & Zynq Sheet.svg",
    snapshotName: "memory-zynq",
  },
  {
    outputFilename: "ebaz4205-PHY & Sundries.svg",
    snapshotName: "phy-sun",
  },
  {
    outputFilename: "ebaz4205-Zynq_IO Sheet.svg",
    snapshotName: "zynq-io",
  },
  {
    outputFilename: "ebaz4205-Zynq Power Sheet.svg",
    snapshotName: "zynq-power",
  },
]

test("compares every EBAZ4205 Circuit JSON sheet with its KiCad conversion", async () => {
  const exports =
    await createOpenSourceSchematicSvgSnapshots("ebaz4205.kicad_sch")
  const svgs = sheets.map(({ outputFilename }) => {
    const svg = exports[outputFilename]
    if (!svg) throw new Error(`KiCad did not export ${outputFilename}`)
    return svg
  })
  for (const svg of svgs) expect(svg).toContain("<svg")
  for (const [index, svg] of svgs.entries()) {
    await expectOpenSourceSchematicSvgSnapshot(
      svg,
      import.meta.path,
      sheets[index]!.snapshotName,
    )
  }
}, 30_000)
