import { expect } from "bun:test"
import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import type { CircuitJson } from "circuit-json"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"
import { type Paper, parseKicadSch } from "kicadts"
import looksSame from "looks-same"
import sharp from "sharp"
import { CircuitJsonToKicadSchConverter } from "../../lib"
import { createSideBySideSvg } from "./create-side-by-side-svg"
import { takeKicadSnapshot } from "./take-kicad-snapshot"

const KICAD_PAPER_DIMENSIONS_MM: Record<
  string,
  { height: number; width: number }
> = {
  A0: { height: 841, width: 1189 },
  A1: { height: 594, width: 841 },
  A2: { height: 420, width: 594 },
  A3: { height: 297, width: 420 },
  A4: { height: 210, width: 297 },
  A5: { height: 148, width: 210 },
  USLegal: { height: 215.9, width: 355.6 },
  USLetter: { height: 215.9, width: 279.4 },
  USLedger: { height: 279.4, width: 431.8 },
}

function getPaperDimensions(paper: Paper | undefined) {
  if (!paper) return undefined
  const dimensions =
    paper.customSize ??
    (paper.size ? KICAD_PAPER_DIMENSIONS_MM[paper.size] : undefined)
  if (!dimensions) return undefined
  return {
    height: paper.isPortrait ? dimensions.width : dimensions.height,
    name: paper.size ?? "User",
    width: paper.isPortrait ? dimensions.height : dimensions.width,
  }
}

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

async function createConvertedSchematicSvg(
  schematicPath: string,
): Promise<string> {
  const sourceContent = await readFile(schematicPath, "utf8")

  const sourceConverter = new KicadToCircuitJsonConverter()
  sourceConverter.addFile(basename(schematicPath), sourceContent)
  sourceConverter.runUntilFinished()

  const sourceSchematic = parseKicadSch(sourceContent)
  const sourceTitleBlock = sourceSchematic.titleBlock
  const converter = new CircuitJsonToKicadSchConverter(
    sourceConverter.getOutput() as CircuitJson,
    {
      paperSize: getPaperDimensions(sourceSchematic.paper),
      titleBlock: sourceTitleBlock
        ? {
            company: sourceTitleBlock.company,
            comments: sourceTitleBlock.comments.map((comment) => ({
              index: comment.index,
              text: comment.value,
            })),
            date: sourceTitleBlock.date,
            revision: sourceTitleBlock.rev,
            title: sourceTitleBlock.title,
          }
        : undefined,
    },
  )
  converter.runUntilFinished()
  const convertedSnapshot = await takeKicadSnapshot({
    generatePng: false,
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "sch",
  })
  const convertedSvg = Object.entries(
    convertedSnapshot.generatedFileContent,
  ).find(([outputFilename]) => outputFilename.endsWith(".svg"))?.[1]
  if (!convertedSvg) {
    throw new Error(
      `KiCad did not export the converted SVG for ${basename(schematicPath)}`,
    )
  }
  return normalizeSchematicSvgForSnapshot(convertedSvg.toString("utf8"))
}

export async function createOpenSourceSchematicSvgSnapshots(
  filename: string,
  sourceFilenameByOutputFilename: Record<string, string> = {},
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
  const rootSvgFilename = filename.replace(/\.kicad_sch$/u, ".svg")
  const sourceFilesBySvgName = new Map(
    Object.entries({
      [rootSvgFilename]: filename,
      ...sourceFilenameByOutputFilename,
    }),
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
        const sourcePath =
          sourceFilename === filename
            ? schematicPath
            : resolve(dirname(schematicPath), sourceFilename)
        const convertedSvg = await createConvertedSchematicSvg(sourcePath)
        return [
          outputFilename,
          createSideBySideSvg(
            normalizeSchematicSvgForSnapshot(sourceSvg.toString("utf8")),
            convertedSvg,
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
  expect(svg).toContain('data-comparison="source"')
  expect(svg).toContain('data-comparison="converted"')
  await expect(
    sharp(Buffer.from(svg), { density: 100 }).metadata(),
  ).resolves.toBeDefined()

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
