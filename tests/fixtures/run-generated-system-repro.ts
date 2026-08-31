import { expect } from "bun:test"
import { readFile, rm, writeFile } from "node:fs/promises"
import { basename } from "node:path"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadSchConverter } from "lib"
import { takeSchematicSheetsSnapshot } from "./take-schematic-sheets-snapshot"

function replaceKicadExportTimestampForComparison(kicadSvg: string): string {
  // kicad-cli writes the export time into the title on every invocation.
  return kicadSvg.replace(
    /(<title>SVG Image created as .*? date )[^<]*(<\/title>)/,
    "$1<export timestamp ignored>$2",
  )
}

export const runGeneratedSystemRepro = async (params: {
  fixtureUrl: URL
  rootFilename: string
  expectedSheetNames: string[]
  snapshotPath: string
  debugOutputName: string
  sheetComparisonLayout?: "horizontal" | "vertical"
}) => {
  const circuitJson = JSON.parse(
    await readFile(params.fixtureUrl, "utf8"),
  ) as CircuitJson
  const sourceSheets = circuitJson
    .filter((element) => element.type === "schematic_sheet")
    .sort(
      (left, right) =>
        Number(left.sheet_index ?? 0) - Number(right.sheet_index ?? 0),
    )
  expect(
    sourceSheets.map((sheet) =>
      String(Reflect.get(sheet, "display_name") ?? sheet.name),
    ),
  ).toEqual(params.expectedSheetNames)

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const kicadSchematicFiles = converter.getOutputFiles({
    schematicFilename: params.rootFilename,
  })
  expect(kicadSchematicFiles.map(({ filename }) => filename)).toEqual([
    params.rootFilename,
    ...sourceSheets.map((sheet) => `${String(sheet.name)}.kicad_sch`),
  ])

  const { stackedPng, svgFiles, svgNames } = await takeSchematicSheetsSnapshot({
    circuitJson,
    files: kicadSchematicFiles,
    rootFilename: params.rootFilename,
    sheetComparisonLayout: params.sheetComparisonLayout,
  })
  const rootSchematicName = basename(params.rootFilename, ".kicad_sch")
  expect(svgNames).toEqual([
    `${rootSchematicName}.svg`,
    ...params.expectedSheetNames.map(
      (sheetName) =>
        `${rootSchematicName}-${sheetName.replace(/[\\/]/g, "_")}.svg`,
    ),
  ])

  const mismatchedSvgNames: string[] = []
  for (const svgName of svgNames) {
    const svgSnapshotName = svgName
      .replace(/\.svg$/, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
    const expectedSvgSnapshotUrl = new URL(
      `../sch/repros/__snapshots__/${svgSnapshotName}.snap.svg`,
      import.meta.url,
    )
    if (
      process.env.BUN_UPDATE_SNAPSHOTS ||
      process.env.FORCE_BUN_UPDATE_SNAPSHOTS
    ) {
      await writeFile(expectedSvgSnapshotUrl, svgFiles[svgName] ?? "", "utf8")
    }
    const generatedKicadSvg = svgFiles[svgName] ?? ""
    const expectedKicadSvg = await readFile(expectedSvgSnapshotUrl, "utf8")
    const receivedSvgSnapshotUrl = new URL(
      `../sch/repros/__snapshots__/${svgSnapshotName}.received.svg`,
      import.meta.url,
    )
    const generatedKicadSvgForComparison =
      replaceKicadExportTimestampForComparison(generatedKicadSvg)
    const expectedKicadSvgForComparison =
      replaceKicadExportTimestampForComparison(expectedKicadSvg)
    if (generatedKicadSvgForComparison !== expectedKicadSvgForComparison) {
      await writeFile(receivedSvgSnapshotUrl, generatedKicadSvg, "utf8")
      mismatchedSvgNames.push(svgName)
    } else {
      await rm(receivedSvgSnapshotUrl, { force: true })
    }
    expect(generatedKicadSvg).toContain("<svg")
  }
  expect(mismatchedSvgNames).toEqual([])

  await Bun.write(`./debug-output/${params.debugOutputName}`, stackedPng)
  expect(stackedPng).toMatchPngSnapshot(params.snapshotPath)
}
