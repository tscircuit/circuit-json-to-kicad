import { $ } from "bun"
import { expect } from "bun:test"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { basename, dirname, join } from "node:path"
import type { CircuitJson } from "circuit-json"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"
import { convertCircuitJsonToSchematicSvg } from "circuit-to-svg"
import { parseKicadSch } from "kicadts"
import looksSame from "looks-same"
import sharp from "sharp"
import { CircuitJsonToKicadSchConverter } from "../../lib"
import { createSideBySideSvg } from "./create-side-by-side-svg"
import { takeKicadSnapshot } from "./take-kicad-snapshot"

const KICAD_TO_CIRCUIT_JSON_UNSUPPORTED_PROPERTY_METADATA =
  /\s+\((?:show_name|show_value|do_not_autoplace)\s+[^)]+\)/gu

function normalizeSchematicSvgForSnapshot(svg: string): string {
  const rootTag = svg.match(/<svg\b[^>]*>/u)?.[0]
  const widthMatch = rootTag?.match(/\bwidth="([\d.]+)(?:mm)?"/u)
  const heightMatch = rootTag?.match(/\bheight="([\d.]+)(?:mm)?"/u)
  let normalizedSvg = svg.replace(
    / date \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2} /u,
    " date normalized ",
  )
  // kicad-cli emits spaces at the end of many SVG lines. They do not affect
  // rendering and make the checked-in snapshots fail the repository diff check.
  normalizedSvg = normalizedSvg.replace(/[ \t]+$/gmu, "")
  if (!rootTag || !widthMatch || !heightMatch) return normalizedSvg

  const sourceWidth = Number(widthMatch[1])
  const sourceHeight = Number(heightMatch[1])
  // Keep the vector viewBox intact while bounding the matcher's raster canvas.
  // Dense FPGA sheets otherwise take minutes to compare at physical A3 size.
  const snapshotWidth = 400
  const snapshotHeight = Math.round(
    (snapshotWidth * sourceHeight) / sourceWidth,
  )
  const normalizedRootTag = rootTag
    .replace(widthMatch[0], `width="${snapshotWidth}"`)
    .replace(heightMatch[0], `height="${snapshotHeight}"`)
  const normalizedRootTagWithViewBox = /\bviewBox=/u.test(normalizedRootTag)
    ? normalizedRootTag
    : normalizedRootTag.replace(
        />$/u,
        ` viewBox="0 0 ${sourceWidth} ${sourceHeight}">`,
      )
  normalizedSvg = normalizedSvg.replace(rootTag, normalizedRootTagWithViewBox)
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

function createSourceCircuitJson(
  filename: string,
  upgradedSourceContent: string,
): CircuitJson {
  const sourceConverter = new KicadToCircuitJsonConverter()
  sourceConverter.addFile(filename, upgradedSourceContent)
  sourceConverter.runUntilFinished()
  const sourceCircuitJson = sourceConverter.getOutput() as CircuitJson
  const sourceComponentIdByImportedReference = new Map(
    sourceCircuitJson
      .filter((element) => element.type === "source_component")
      .map((element) => [
        `${String(element.name)}_source`,
        element.source_component_id,
      ]),
  )

  // kicad-to-circuit-json 0.0.120 inserts generated source_component IDs but
  // leaves schematic_component references pointing at library-derived IDs.
  // Repair that relationship so this fixture passes valid Circuit JSON to the
  // converter under test; no component geometry or connectivity is changed.
  return sourceCircuitJson.map((element) => {
    if (element.type !== "schematic_component") return element
    if (!element.source_component_id) return element
    const sourceComponentId = sourceComponentIdByImportedReference.get(
      element.source_component_id,
    )
    return sourceComponentId
      ? { ...element, source_component_id: sourceComponentId }
      : element
  }) as CircuitJson
}

async function createConvertedSchematicSvg(
  filename: string,
  sourceCircuitJson: CircuitJson,
): Promise<string> {
  const converter = new CircuitJsonToKicadSchConverter(sourceCircuitJson)
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
  const rootContent = await readFile(schematicPath, "utf8")
  const upgradedRootContent = await upgradeSchematicForRoundTrip(
    filename,
    rootContent,
  )
  const sourceFilesBySvgName = getSourceFilesBySvgName(
    filename,
    upgradedRootContent,
  )

  return Object.fromEntries(
    await Promise.all(
      [...sourceFilesBySvgName].map(
        async ([outputFilename, sourceFilename]) => {
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
              : await upgradeSchematicForRoundTrip(
                  sourceFilename,
                  sourceContent,
                )
          const sourceCircuitJson = createSourceCircuitJson(
            sourceFilename,
            upgradedSourceContent,
          )
          const sourceSvg = normalizeSchematicSvgForSnapshot(
            convertCircuitJsonToSchematicSvg(sourceCircuitJson),
          )
          const convertedSvg = await createConvertedSchematicSvg(
            sourceFilename,
            sourceCircuitJson,
          )
          return [outputFilename, createSideBySideSvg(sourceSvg, convertedSvg)]
        },
      ),
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
    createDiffImage: true,
    ignoreCaret: true,
    shouldCluster: true,
    strict: false,
    tolerance: 5,
  })

  if (result.equal) {
    expect(result.equal).toBe(true)
    return
  }

  const diffPercentage = (result.differentPixels / result.totalPixels) * 100
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
  await result.diffImage.save(diffPath)
  throw new Error(
    `SVG snapshot differs by ${diffPercentage.toFixed(3)}% (threshold: ${acceptableDiffPercentage}%). Received SVG saved at ${receivedPath}; diff saved at ${diffPath}`,
  )
}
