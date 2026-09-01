import { $ } from "bun"
import { expect } from "bun:test"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { basename, dirname, join } from "node:path"
import type { CircuitJson } from "circuit-json"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"
import { parseKicadSch } from "kicadts"
import looksSame from "looks-same"
import sharp from "sharp"
import { CircuitJsonToKicadSchConverter } from "../../lib"
import { createSideBySideSvg } from "./create-side-by-side-svg"
import { takeKicadSnapshot } from "./take-kicad-snapshot"

const KICAD_TO_CIRCUIT_JSON_UNSUPPORTED_PROPERTY_METADATA =
  /\s+\((?:show_name|show_value|do_not_autoplace)\s+[^)]+\)/gu

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

async function upgradeSchematicForRoundTrip(
  filename: string,
  sourceContent: string,
): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "kicad-sch-upgrade-"))
  const tempPath = join(tempDir, basename(filename))
  try {
    await writeFile(tempPath, sourceContent)
    const upgradeResult = await $`kicad-cli sch upgrade --force ${tempPath}`
      .quiet()
      .nothrow()
    if (upgradeResult.exitCode !== 0) {
      throw new Error(
        `kicad-cli schematic upgrade failed for ${filename}: ${upgradeResult.stderr.toString()}`,
      )
    }

    // kicad-to-circuit-json 0.0.120 predates these KiCad 10 property display
    // flags. They do not affect schematic connectivity or rendered content, so
    // remove them from the temporary upgraded copy used as conversion input.
    return (await readFile(tempPath, "utf8")).replace(
      KICAD_TO_CIRCUIT_JSON_UNSUPPORTED_PROPERTY_METADATA,
      "",
    )
  } finally {
    await rm(tempDir, { force: true, recursive: true })
  }
}

async function createRoundTripSchematicSvg(
  filename: string,
  upgradedSourceContent: string,
): Promise<string> {
  const sourceConverter = new KicadToCircuitJsonConverter()
  sourceConverter.addFile(filename, upgradedSourceContent)
  sourceConverter.runUntilFinished()

  const converter = new CircuitJsonToKicadSchConverter(
    sourceConverter.getOutput() as CircuitJson,
  )
  converter.runUntilFinished()
  const roundTripSnapshot = await takeKicadSnapshot({
    generatePng: false,
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "sch",
  })
  const roundTripSvg = Object.entries(
    roundTripSnapshot.generatedFileContent,
  ).find(([outputFilename]) => outputFilename.endsWith(".svg"))?.[1]
  if (!roundTripSvg) {
    throw new Error(`KiCad did not export the round-trip SVG for ${filename}`)
  }
  return normalizeSchematicSvgForSnapshot(roundTripSvg.toString("utf8"))
}

function getSourceFilesBySvgName(
  rootFilename: string,
  upgradedRootContent: string,
): Map<string, string> {
  const rootBase = basename(rootFilename, ".kicad_sch")
  const sourceFilesBySvgName = new Map<string, string>([
    [`${rootBase}.svg`, rootFilename],
  ])
  const rootSchematic = parseKicadSch(upgradedRootContent)
  for (const sheet of rootSchematic.sheets) {
    const sheetName = sheet.properties.find(
      (property) => property.key === "Sheetname",
    )?.value
    const sheetFilename = sheet.properties.find(
      (property) => property.key === "Sheetfile",
    )?.value
    if (!sheetName || !sheetFilename) continue
    sourceFilesBySvgName.set(
      `${rootBase}-${sheetName.replace(/[\\/]/gu, "_")}.svg`,
      sheetFilename,
    )
  }
  return sourceFilesBySvgName
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
  const rootContent = await readFile(schematicPath, "utf8")
  const upgradedRootContent = await upgradeSchematicForRoundTrip(
    filename,
    rootContent,
  )
  const sourceFilesBySvgName = getSourceFilesBySvgName(
    filename,
    upgradedRootContent,
  )
  const sourceSvgEntries = Object.entries(snapshot.generatedFileContent).filter(
    ([outputFilename]) => outputFilename.endsWith(".svg"),
  )

  return Object.fromEntries(
    await Promise.all(
      sourceSvgEntries.map(async ([outputFilename, sourceSvg]) => {
        const sourceFilename = sourceFilesBySvgName.get(outputFilename)
        if (!sourceFilename) {
          throw new Error(
            `Could not map KiCad SVG ${outputFilename} to a source schematic file`,
          )
        }
        const sourceContent =
          sourceFilename === filename
            ? rootContent
            : await readFile(
                resolve(dirname(schematicPath), sourceFilename),
                "utf8",
              )
        const upgradedSourceContent =
          sourceFilename === filename
            ? upgradedRootContent
            : await upgradeSchematicForRoundTrip(sourceFilename, sourceContent)
        const roundTripSvg = await createRoundTripSchematicSvg(
          sourceFilename,
          upgradedSourceContent,
        )
        return [
          outputFilename,
          createSideBySideSvg(
            normalizeSchematicSvgForSnapshot(sourceSvg.toString("utf8")),
            roundTripSvg,
          ),
        ]
      }),
    ),
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
  const updateSnapshot =
    process.argv.includes("--update-snapshots") ||
    process.argv.includes("-u") ||
    Boolean(process.env.BUN_UPDATE_SNAPSHOTS)

  if (!existsSync(snapshotPath) || updateSnapshot) {
    await mkdir(dirname(snapshotPath), { recursive: true })
    await writeFile(snapshotPath, svg)
    expect(existsSync(snapshotPath)).toBe(true)
    return
  }

  const existingSnapshot = await readFile(snapshotPath, "utf8")
  if (existingSnapshot === svg) {
    expect(svg).toBe(existingSnapshot)
    return
  }

  const [existingPng, receivedPng] = await Promise.all([
    sharp(Buffer.from(existingSnapshot), { density: 100 }).png().toBuffer(),
    sharp(Buffer.from(svg), { density: 100 }).png().toBuffer(),
  ])
  const result = await looksSame(existingPng, receivedPng, {
    antialiasingTolerance: 4,
    ignoreCaret: true,
    shouldCluster: true,
    strict: false,
    tolerance: 5,
  })

  if (result.equal) {
    expect(result.equal).toBe(true)
    return
  }

  const width = existingPng.readUInt32BE(16)
  const height = existingPng.readUInt32BE(20)
  const diffBounds = result.diffBounds
  const diffArea = diffBounds
    ? (diffBounds.right - diffBounds.left) *
      (diffBounds.bottom - diffBounds.top)
    : width * height
  const diffPercentage = (diffArea / (width * height)) * 100
  // Match the repository's PNG snapshot policy. KiCad patch releases can alter
  // fonts and strokes throughout an otherwise equivalent schematic export.
  const acceptableDiffPercentage = process.env.CI ? 90 : 0.5

  if (diffPercentage <= acceptableDiffPercentage) {
    console.log(
      `SVG snapshot matches (${diffPercentage.toFixed(3)}% difference, within ${acceptableDiffPercentage}% threshold)`,
    )
    expect(diffPercentage).toBeLessThanOrEqual(acceptableDiffPercentage)
    return
  }

  const receivedPath = snapshotPath.replace(/\.snap\.svg$/u, ".received.svg")
  const diffPath = snapshotPath.replace(/\.snap\.svg$/u, ".diff.png")
  await writeFile(receivedPath, svg)
  await looksSame.createDiff({
    current: receivedPng,
    diff: diffPath,
    highlightColor: "#ff00ff",
    reference: existingPng,
  })
  throw new Error(
    `SVG snapshot differs by ${diffPercentage.toFixed(3)}% (threshold: ${acceptableDiffPercentage}%). Received SVG saved at ${receivedPath}; diff saved at ${diffPath}`,
  )
}
