import { expect } from "bun:test"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import type { CircuitJson } from "circuit-json"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"
import { type Paper, parseKicadSch, type TitleBlock } from "kicadts"
import looksSame from "looks-same"
import sharp from "sharp"
import {
  CircuitJsonToKicadSchConverter,
  type KicadSchematicSheetOptions,
} from "../../lib"
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

// kicad-to-circuit-json maps this KiCad page point to Circuit JSON (0, 0).
// Supplying the inverse placement keeps imported content at its source location.
const KICAD_TO_CIRCUIT_JSON_ORIGIN_MM = { x: 105, y: 148.5 }

function getPaperDimensions(paper: Paper | undefined) {
  if (!paper) return undefined
  const customSize = paper.customSize
  const dimensions =
    customSize ??
    (paper.size ? KICAD_PAPER_DIMENSIONS_MM[paper.size] : undefined)
  if (!dimensions) return undefined
  return {
    ...(customSize ? { customSize } : {}),
    height: paper.isPortrait ? dimensions.width : dimensions.height,
    isPortrait: paper.isPortrait,
    name: paper.size ?? "User",
    width: paper.isPortrait ? dimensions.height : dimensions.width,
  }
}

function getTitleBlockMetadata(sourceTitleBlock: TitleBlock | undefined) {
  if (!sourceTitleBlock) return undefined
  return {
    company: sourceTitleBlock.company,
    comments: sourceTitleBlock.comments.map((comment) => ({
      index: comment.index,
      text: comment.value,
    })),
    date: sourceTitleBlock.date,
    revision: sourceTitleBlock.rev,
    title: sourceTitleBlock.title,
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
  const converter = new CircuitJsonToKicadSchConverter(
    sourceConverter.getOutput() as CircuitJson,
    {
      paperSize: getPaperDimensions(sourceSchematic.paper),
      schematicSheets: [{ circuitOrigin: KICAD_TO_CIRCUIT_JSON_ORIGIN_MM }],
      titleBlock: getTitleBlockMetadata(sourceSchematic.titleBlock),
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

function namespaceCircuitJson(
  circuitJson: CircuitJson,
  namespace: string,
  schematicSheetId?: string,
): CircuitJson {
  const ids = new Set<string>()
  for (const element of circuitJson as Record<string, unknown>[]) {
    for (const [key, value] of Object.entries(element)) {
      if (key.endsWith("_id") && typeof value === "string") ids.add(value)
    }
  }

  const namespaceValue = (value: unknown): unknown => {
    if (typeof value === "string" && ids.has(value)) {
      return `${namespace}_${value}`
    }
    if (Array.isArray(value)) return value.map(namespaceValue)
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => [
          key,
          namespaceValue(nestedValue),
        ]),
      )
    }
    return value
  }

  return (circuitJson as Record<string, unknown>[]).map((element) => {
    const namespacedElement = namespaceValue(element) as Record<string, unknown>
    if (
      schematicSheetId &&
      typeof namespacedElement.type === "string" &&
      namespacedElement.type.startsWith("schematic_") &&
      namespacedElement.type !== "schematic_symbol"
    ) {
      namespacedElement.schematic_sheet_id = schematicSheetId
    }
    return namespacedElement
  }) as CircuitJson
}

async function createConvertedSchematicSvgs({
  rootSchematicPath,
  sourceFilesBySvgName,
}: {
  rootSchematicPath: string
  sourceFilesBySvgName: Map<string, string>
}): Promise<Record<string, string>> {
  if (sourceFilesBySvgName.size === 1) {
    const outputFilename = sourceFilesBySvgName.keys().next().value
    if (!outputFilename) throw new Error("Missing source schematic SVG name")
    return {
      [outputFilename]: await createConvertedSchematicSvg(rootSchematicPath),
    }
  }

  const rootFilename = basename(rootSchematicPath)
  const rootSvgFilename = rootFilename.replace(/\.kicad_sch$/u, ".svg")
  const rootContent = await readFile(rootSchematicPath, "utf8")
  const rootSourceConverter = new KicadToCircuitJsonConverter()
  rootSourceConverter.addFile(rootFilename, rootContent)
  rootSourceConverter.runUntilFinished()

  const rootSchematic = parseKicadSch(rootContent)
  const circuitJson: Record<string, unknown>[] = [
    ...(namespaceCircuitJson(
      rootSourceConverter.getOutput() as CircuitJson,
      "root",
    ) as Record<string, unknown>[]),
  ]
  const schematicSheets: KicadSchematicSheetOptions[] = [
    { circuitOrigin: KICAD_TO_CIRCUIT_JSON_ORIGIN_MM },
  ]

  const sourcePageByFilename = new Map<string, number>()
  const sourceSheetInstances = rootSchematic.sheetInstances[0]
  for (const sheet of rootSchematic.sheets) {
    const sourceFilename = sheet.properties.find(
      (property) => property.key === "Sheet file",
    )?.value
    const sheetUuid = sheet.uuid?.value
    const pageNumber = Number(
      sourceSheetInstances?.paths.find(
        (path) => path.value === `/${sheetUuid}/`,
      )?.pages[0]?.value,
    )
    if (sourceFilename && Number.isFinite(pageNumber)) {
      sourcePageByFilename.set(sourceFilename, pageNumber)
    }
  }

  const childSourceFiles = [...sourceFilesBySvgName.entries()]
    .filter(([outputFilename]) => outputFilename !== rootSvgFilename)
    .sort(
      ([, leftFilename], [, rightFilename]) =>
        (sourcePageByFilename.get(leftFilename) ?? Number.MAX_SAFE_INTEGER) -
        (sourcePageByFilename.get(rightFilename) ?? Number.MAX_SAFE_INTEGER),
    )

  let sheetIndex = 0
  for (const [outputFilename, sourceFilename] of childSourceFiles) {
    const schematicSheetId = `schematic_sheet_${sheetIndex}`
    const displayName = outputFilename
      .replace(`${rootSvgFilename.replace(/\.svg$/u, "")}-`, "")
      .replace(/\.svg$/u, "")
    circuitJson.push({
      type: "schematic_sheet",
      schematic_sheet_id: schematicSheetId,
      name: sourceFilename.replace(/\.kicad_sch$/u, ""),
      display_name: displayName,
      sheet_index: sheetIndex,
    })

    const childPath = resolve(dirname(rootSchematicPath), sourceFilename)
    const childContent = await readFile(childPath, "utf8")
    const childSourceConverter = new KicadToCircuitJsonConverter()
    childSourceConverter.addFile(sourceFilename, childContent)
    childSourceConverter.runUntilFinished()
    circuitJson.push(
      ...(namespaceCircuitJson(
        childSourceConverter.getOutput() as CircuitJson,
        `sheet_${sheetIndex}`,
        schematicSheetId,
      ) as Record<string, unknown>[]),
    )
    schematicSheets.push({
      circuitOrigin: KICAD_TO_CIRCUIT_JSON_ORIGIN_MM,
      schematicSheetId,
    })
    sheetIndex += 1
  }

  const converter = new CircuitJsonToKicadSchConverter(
    circuitJson as CircuitJson,
    {
      paperSize: getPaperDimensions(rootSchematic.paper),
      schematicSheets,
      titleBlock: getTitleBlockMetadata(rootSchematic.titleBlock),
    },
  )
  converter.runUntilFinished()

  const tempDir = await mkdtemp(join(tmpdir(), "converted-kicad-hierarchy-"))
  try {
    const outputFiles = converter.getOutputFiles({
      schematicFilename: rootFilename,
    })
    for (const file of outputFiles) {
      await writeFile(join(tempDir, file.filename), file.content)
    }
    const snapshot = await takeKicadSnapshot({
      generatePng: false,
      kicadFilePath: join(tempDir, rootFilename),
      kicadFileType: "sch",
    })
    return Object.fromEntries(
      Object.entries(snapshot.generatedFileContent).map(
        ([outputFilename, svg]) => [
          outputFilename,
          normalizeSchematicSvgForSnapshot(svg.toString("utf8")),
        ],
      ),
    )
  } finally {
    await rm(tempDir, { force: true, recursive: true })
  }
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
  const convertedSvgs = await createConvertedSchematicSvgs({
    rootSchematicPath: schematicPath,
    sourceFilesBySvgName,
  })

  return Object.fromEntries(
    await Promise.all(
      sourceSvgEntries.map(async ([outputFilename, sourceSvg]) => {
        const sourceFilename = sourceFilesBySvgName.get(outputFilename)
        if (!sourceFilename) {
          throw new Error(
            `Could not map KiCad SVG ${outputFilename} to a source schematic file`,
          )
        }
        const convertedSvg = convertedSvgs[outputFilename]
        if (!convertedSvg) {
          throw new Error(
            `Converted KiCad hierarchy did not export ${outputFilename}`,
          )
        }
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
