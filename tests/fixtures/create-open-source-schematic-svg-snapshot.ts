import { expect } from "bun:test"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { basename, dirname, join } from "node:path"
import { takeKicadSnapshot } from "./take-kicad-snapshot"

function normalizeSchematicSvgForSnapshot(svg: string): string {
  const dimensions = svg.match(/\bwidth="([\d.]+)mm"\s+height="([\d.]+)mm"/u)
  let normalizedSvg = svg.replace(
    / date \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2} /u,
    " date normalized ",
  )
  // kicad-cli emits spaces at the end of many SVG lines. They do not affect
  // rendering and make the checked-in snapshots fail the repository diff check.
  normalizedSvg = normalizedSvg.replace(/[ \t]+$/gmu, "")
  if (!dimensions) return normalizedSvg

  const sourceWidth = Number(dimensions[1])
  const sourceHeight = Number(dimensions[2])
  // Keep the vector viewBox intact while bounding the matcher's raster canvas.
  // Dense FPGA sheets otherwise take minutes to compare at physical A3 size.
  const snapshotWidth = 400
  const snapshotHeight = Math.round(
    (snapshotWidth * sourceHeight) / sourceWidth,
  )
  normalizedSvg = normalizedSvg.replace(
    dimensions[0],
    `width="${snapshotWidth}" height="${snapshotHeight}"`,
  )
  return normalizedSvg
}

export async function createOpenSourceSchematicSvgSnapshots(
  filename: string,
): Promise<Record<string, string>> {
  const schematicPath = resolve(
    import.meta.dir,
    "..",
    "..",
    "references",
    filename,
  )
  const snapshot = await takeKicadSnapshot({
    generatePng: false,
    kicadFilePath: schematicPath,
    kicadFileType: "sch",
  })
  return Object.fromEntries(
    Object.entries(snapshot.generatedFileContent)
      .filter(([outputFilename]) => outputFilename.endsWith(".svg"))
      .map(([outputFilename, svg]) => [
        outputFilename,
        normalizeSchematicSvgForSnapshot(svg.toString("utf8")),
      ]),
  )
}

export async function createOpenSourceSchematicSvgSnapshot(
  filename: string,
): Promise<string> {
  const snapshots = await createOpenSourceSchematicSvgSnapshots(filename)
  const svgFilename = filename.replace(/\.kicad_sch$/u, ".svg")
  const svg = snapshots[svgFilename]
  if (!svg) {
    throw new Error(`KiCad did not export ${svgFilename}`)
  }
  return svg
}

export async function expectOpenSourceSchematicSvgSnapshot(
  svg: string,
  testPathOriginal: string,
  snapshotName?: string,
): Promise<void> {
  const testPath = testPathOriginal.replace(/\.test\.tsx?$/u, "")
  const snapshotFilename = snapshotName
    ? `${basename(testPath)}-${snapshotName}.snap.svg`
    : `${basename(testPath)}.snap.svg`
  const snapshotPath = join(
    dirname(testPath),
    "__snapshots__",
    snapshotFilename,
  )

  if (existsSync(snapshotPath)) {
    const existingSnapshot = await readFile(snapshotPath, "utf8")
    if (existingSnapshot === svg) {
      expect(svg).toBe(existingSnapshot)
      return
    }
  }

  await expect(svg).toMatchSvgSnapshot(testPathOriginal, snapshotName)
}
