import { $ } from "bun"
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import type { CircuitJson } from "circuit-json"
import { convertCircuitJsonToSchematicSvg } from "circuit-to-svg"
import { parseKicadSch } from "kicadts"
import sharp from "sharp"
import { stackPngsHorizontally } from "./stackPngsHorizontally"
import { stackPngsVertically } from "./stackPngsVertically"

export interface SchematicSheetsSnapshot {
  /** Per-page SVG names kicad-cli produced (root/overview page + one per sheet) */
  svgNames: string[]
  /** Raw per-page SVG output, keyed by the filename produced by kicad-cli. */
  svgFiles: Record<string, string>
  /** KiCad root page followed by one tscircuit/KiCad comparison row per child sheet. */
  stackedPng: Buffer
}

/** Overlay a small black label band in the top-left corner of a PNG. */
async function withLabel(
  png: Buffer,
  text: string,
  fontSize: number,
  padding: number,
): Promise<Buffer> {
  const label = Buffer.from(`
    <svg width="${text.length * fontSize * 0.62 + padding * 2}" height="${fontSize + padding * 2}">
      <rect width="100%" height="100%" fill="black"/>
      <text x="${padding}" y="${padding + fontSize * 0.8}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="white">${text}</text>
    </svg>
  `)
  return sharp(png)
    .composite([
      { input: await sharp(label).png().toBuffer(), left: 0, top: 0 },
    ])
    .png()
    .toBuffer()
}

/**
 * Sort rank for a per-page SVG: the root/overview page first (-1), then child
 * sheets in the order their `(sheet)` nodes appear in the root file (KiCad page
 * order); unknown names sort last.
 */
function svgSheetRank(
  svgName: string,
  rootBase: string,
  orderedSheetNames: string[],
): number {
  if (svgName === `${rootBase}.svg`) return -1
  const sheetName = svgName.slice(rootBase.length + 1, -".svg".length)
  // kicad-cli replaces path separators in sheet display names when deriving
  // per-page SVG filenames (for example, "I/O" becomes "I_O").
  const idx = orderedSheetNames
    .map((name) => name.replace(/[\\/]/g, "_"))
    .indexOf(sheetName)
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx
}

/**
 * Renders a full hierarchical KiCad schematic project (root + child sheet files)
 * with real `kicad-cli`, then renders the KiCad root page followed by one
 * side-by-side Circuit JSON/KiCad comparison row for each child sheet.
 *
 * Throws if kicad-cli fails to parse/render the hierarchy, so a malformed sheet
 * node, instance path, or missing child file fails the test loudly.
 */
export const takeSchematicSheetsSnapshot = async (params: {
  circuitJson: CircuitJson
  files: { filename: string; content: string }[]
  rootFilename: string
}): Promise<SchematicSheetsSnapshot> => {
  const { circuitJson, files, rootFilename } = params

  const kicadCliVersion = await $`kicad-cli --version`
  if (!kicadCliVersion.stdout.toString().trim().startsWith("10.")) {
    throw new Error("kicad-cli version 10.0.0 or higher is required")
  }

  const tempDir = await mkdtemp(join(tmpdir(), "kicad-sheets-snapshot-"))
  try {
    for (const file of files) {
      await writeFile(join(tempDir, file.filename), file.content)
    }

    const outputDir = join(tempDir, "output")
    const exportResult =
      await $`kicad-cli sch export svg ${join(tempDir, rootFilename)} -o ${outputDir} --theme Modern`
    if (exportResult.exitCode !== 0) {
      throw new Error(
        `kicad-cli hierarchical export failed with exit code ${exportResult.exitCode}\nStderr: ${exportResult.stderr}`,
      )
    }

    // Order the per-page SVGs: root/overview first, then child sheets in KiCad
    // page order (the sheet plan / sheetIndex order), read from the root file's
    // `(sheet)` nodes rather than sorted alphabetically.
    const rootBase = basename(rootFilename, ".kicad_sch")
    const rootContent =
      files.find((f) => f.filename === rootFilename)?.content ??
      files[0]?.content
    let orderedSheetNames: string[] = []
    try {
      if (rootContent) {
        orderedSheetNames = parseKicadSch(rootContent).sheets.map(
          (s) => s.properties.find((p) => p.key === "Sheetname")?.value ?? "",
        )
      }
    } catch {
      // fall back to alphabetical ordering below
    }
    const svgNames = (await readdir(outputDir))
      .filter((f) => f.endsWith(".svg"))
      .sort((a, b) => {
        const rankDelta =
          svgSheetRank(a, rootBase, orderedSheetNames) -
          svgSheetRank(b, rootBase, orderedSheetNames)
        return rankDelta !== 0 ? rankDelta : a.localeCompare(b)
      })
    if (svgNames.length === 0) {
      throw new Error("kicad-cli produced no SVG files")
    }

    // Render the KiCad root page and child sheets in hierarchy order.
    const kicadPngs: Buffer[] = []
    const svgFiles: Record<string, string> = {}
    for (const svgName of svgNames) {
      const svgBuffer = await readFile(join(outputDir, svgName))
      svgFiles[svgName] = svgBuffer.toString("utf8")
      const png = await sharp(svgBuffer, { density: 100 }).png().toBuffer()
      kicadPngs.push(await withLabel(png, svgName, 22, 6))
    }
    const sourceSheets = circuitJson
      .filter((element) => element.type === "schematic_sheet")
      .sort(
        (left, right) =>
          Number(left.sheet_index ?? 0) - Number(right.sheet_index ?? 0),
      )
    const comparisonRows = [kicadPngs[0]!]
    for (const [sheetIndex, sourceSheet] of sourceSheets.entries()) {
      const sourceSvg = convertCircuitJsonToSchematicSvg(circuitJson as any, {
        schematicSheetId: String(sourceSheet.schematic_sheet_id),
      })
      const sourcePng = await sharp(Buffer.from(sourceSvg)).png().toBuffer()
      const sourceSheetName = String(
        Reflect.get(sourceSheet, "display_name") ?? sourceSheet.name,
      )
      const kicadPng = kicadPngs[sheetIndex + 1]
      if (!kicadPng) {
        throw new Error(`Missing KiCad render for ${sourceSheetName}`)
      }
      comparisonRows.push(
        await stackPngsHorizontally([
          await withLabel(sourcePng, `Circuit JSON: ${sourceSheetName}`, 22, 6),
          kicadPng,
        ]),
      )
    }

    const stackedPng = await stackPngsVertically(comparisonRows)

    return { svgFiles, svgNames, stackedPng }
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}
