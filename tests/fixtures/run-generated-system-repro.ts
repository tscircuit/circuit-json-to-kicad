import { expect } from "bun:test"
import { readFile, rm, writeFile } from "node:fs/promises"
import { basename } from "node:path"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadSchConverter } from "lib"
import { takeSchematicSheetsSnapshot } from "./take-schematic-sheets-snapshot"

const normalizeKicadSvgSnapshot = (svg: string) =>
  svg.replace(
    /(<title>SVG Image created as .*? date )[^<]*(<\/title>)/,
    "$1<normalized>$2",
  )

export const runGeneratedSystemRepro = async (params: {
  fixtureUrl: URL
  rootFilename: string
  expectedSheetNames: string[]
  snapshotPath: string
  debugOutputName: string
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
  const files = converter.getOutputFiles({
    schematicFilename: params.rootFilename,
  })
  expect(files.map(({ filename }) => filename)).toEqual([
    params.rootFilename,
    ...sourceSheets.map((sheet) => `${String(sheet.name)}.kicad_sch`),
  ])

  const { stackedPng, svgFiles, svgNames } = await takeSchematicSheetsSnapshot({
    circuitJson,
    files,
    rootFilename: params.rootFilename,
  })
  const rootBase = basename(params.rootFilename, ".kicad_sch")
  expect(svgNames).toEqual([
    `${rootBase}.svg`,
    ...params.expectedSheetNames.map(
      (sheetName) => `${rootBase}-${sheetName.replace(/[\\/]/g, "_")}.svg`,
    ),
  ])

  const svgMismatches: string[] = []
  for (const svgName of svgNames) {
    const snapshotName = svgName
      .replace(/\.svg$/, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
    const snapshotUrl = new URL(
      `../sch/repros/__snapshots__/${snapshotName}.snap.svg`,
      import.meta.url,
    )
    if (
      process.env.BUN_UPDATE_SNAPSHOTS ||
      process.env.FORCE_BUN_UPDATE_SNAPSHOTS ||
      process.env.KICAD_UPDATE_GENERATED_SYSTEM_SVG_SNAPSHOTS
    ) {
      await writeFile(snapshotUrl, svgFiles[svgName] ?? "", "utf8")
    }
    const generatedSvg = svgFiles[svgName] ?? ""
    const storedSvg = await readFile(snapshotUrl, "utf8")
    const receivedUrl = new URL(
      `../sch/repros/__snapshots__/${snapshotName}.received.svg`,
      import.meta.url,
    )
    const normalizedGenerated = normalizeKicadSvgSnapshot(generatedSvg)
    const normalizedStored = normalizeKicadSvgSnapshot(storedSvg)
    if (normalizedGenerated !== normalizedStored) {
      await writeFile(receivedUrl, generatedSvg, "utf8")
      svgMismatches.push(svgName)
    } else {
      await rm(receivedUrl, { force: true })
    }
    expect(generatedSvg).toContain("<svg")
  }
  expect(svgMismatches).toEqual([])

  await Bun.write(`./debug-output/${params.debugOutputName}`, stackedPng)
  expect(stackedPng).toMatchPngSnapshot(params.snapshotPath)
}
