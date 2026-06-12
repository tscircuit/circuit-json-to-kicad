import { $ } from "bun"
import { tmpdir } from "node:os"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { parseKicadPcb } from "kicadts"
import sharp from "sharp"

type FilePath = string
type FileContent = Buffer

export interface KicadOutput {
  exitCode: number
  generatedFileContent: Record<FilePath, FileContent>
}

const KICAD_10_DRILL_FILL_STYLE =
  "fill:#000000; fill-opacity:1.0000; stroke:none;"
const KICAD_10_OVAL_HOLE_STROKE_REGEX =
  /(<g style="fill:none;\s*stroke:)#000000(; stroke-width:[^"]*stroke-linecap:round; stroke-linejoin:round;">)/g
const PCB_SNAPSHOT_COPPER_LAYER_EXPORT_ORDER = [
  "B.Cu",
  "In1.Cu",
  "In2.Cu",
  "F.Cu",
]
const KICAD_FILLED_PATH_STYLE_REGEX =
  /fill:[^"]+fill-opacity:1\.0000; stroke:none;fill-rule:evenodd;/g

const getZoneFilledPolygonCountsByLayer = (
  kicadPcbContent: string,
): Map<string, number> => {
  const zoneFilledPolygonCountsByLayer = new Map<string, number>()

  try {
    const pcb = parseKicadPcb(kicadPcbContent)

    for (const zone of pcb.zones) {
      const layerName = zone.layer?.names[0]
      if (!layerName || zone.filledPolygons.length === 0) continue

      zoneFilledPolygonCountsByLayer.set(
        layerName,
        (zoneFilledPolygonCountsByLayer.get(layerName) ?? 0) +
          zone.filledPolygons.length,
      )
    }
  } catch {
    // Snapshot styling is best-effort only.
  }

  return zoneFilledPolygonCountsByLayer
}

const updateLastFilledPathStyles = (
  svg: string,
  filledPathStyle: string,
  count: number,
  opacity: number,
): string => {
  if (count <= 0) return svg

  const pathPrefix = `<path style="${filledPathStyle}"`
  const matchIndices: number[] = []
  let searchStart = 0

  while (true) {
    const matchIndex = svg.indexOf(pathPrefix, searchStart)
    if (matchIndex === -1) break
    matchIndices.push(matchIndex)
    searchStart = matchIndex + pathPrefix.length
  }

  if (matchIndices.length === 0) return svg

  const adjustedOpacity = Math.max(0, Math.min(1, opacity)).toFixed(4)
  const updatedStyle = filledPathStyle.replace(
    "fill-opacity:1.0000;",
    `fill-opacity:${adjustedOpacity};`,
  )

  let normalizedSvg = svg
  for (const matchIndex of matchIndices.slice(-count).reverse()) {
    normalizedSvg =
      normalizedSvg.slice(0, matchIndex) +
      `<path style="${updatedStyle}"` +
      normalizedSvg.slice(matchIndex + pathPrefix.length)
  }

  return normalizedSvg
}

/**
 * KiCad 10 renders circular drill holes as filled black circles and pill/oval
 * drill holes as black stroked round-cap paths in SVG exports. This helper can
 * remap those hole colors for snapshot readability without changing the KiCad
 * PCB data itself.
 */
export function normalizePcbSvgForSnapshot(
  svg: string,
  {
    pcbDrillHoleColor,
    pcbCopperPourOpacity,
    zoneFilledPolygonCountsByLayer,
  }: {
    pcbDrillHoleColor?: string
    pcbCopperPourOpacity?: number
    zoneFilledPolygonCountsByLayer?: Map<string, number>
  } = {},
): string {
  let normalizedSvg = svg

  if (pcbDrillHoleColor) {
    const drillFillStyle = `fill:${pcbDrillHoleColor}; fill-opacity:1.0000; stroke:none;`

    normalizedSvg = normalizedSvg
      .replaceAll(KICAD_10_DRILL_FILL_STYLE, drillFillStyle)
      .replace(KICAD_10_OVAL_HOLE_STROKE_REGEX, `$1${pcbDrillHoleColor}$2`)
  }

  if (
    pcbCopperPourOpacity === undefined ||
    !zoneFilledPolygonCountsByLayer ||
    zoneFilledPolygonCountsByLayer.size === 0
  ) {
    return normalizedSvg
  }

  const distinctFilledPathStylesInOrder = Array.from(
    new Set(normalizedSvg.match(KICAD_FILLED_PATH_STYLE_REGEX) ?? []),
  )

  let styleIndex = 0
  for (const layerName of PCB_SNAPSHOT_COPPER_LAYER_EXPORT_ORDER) {
    const filledPolygonCount =
      zoneFilledPolygonCountsByLayer.get(layerName) ?? 0
    if (filledPolygonCount === 0) continue

    const filledPathStyle = distinctFilledPathStylesInOrder[styleIndex]
    styleIndex += 1

    if (!filledPathStyle) continue

    normalizedSvg = updateLastFilledPathStyles(
      normalizedSvg,
      filledPathStyle,
      filledPolygonCount,
      pcbCopperPourOpacity,
    )
  }

  return normalizedSvg
}

/**
 * Executes kicad-cli commands e.g.
 * - kicad-cli sch export svg ./flat_hierarchy.kicad_sch -o out/svg --theme "Modern" --no-background-color
 *
 * ...and returns the outputs
 */
export const takeKicadSnapshot = async (params: {
  kicadFilePath?: string
  kicadFileContent?: string
  kicadFileType: "sch" | "pcb" | "3d"
  pcbDrillHoleColor?: string
  pcbCopperPourOpacity?: number
}): Promise<KicadOutput> => {
  const {
    kicadFilePath,
    kicadFileContent,
    kicadFileType,
    pcbDrillHoleColor,
    pcbCopperPourOpacity,
  } = params

  // Check to make sure kicad-cli is installed
  const kicadCliVersion = await $`kicad-cli --version`

  if (!kicadCliVersion.stdout.toString().trim().startsWith("10.")) {
    throw new Error("kicad-cli version 9.0.0 or higher is required")
  }

  // Create a temporary directory for working with files
  const tempDir = await mkdtemp(join(tmpdir(), "kicad-snapshot-"))
  let inputFilePath: string

  try {
    // Determine input file path
    if (kicadFilePath) {
      inputFilePath = kicadFilePath
    } else if (kicadFileContent) {
      const ext = kicadFileType === "sch" ? "sch" : "pcb"
      inputFilePath = join(tempDir, `temp_file.kicad_${ext}`)
      await writeFile(inputFilePath, kicadFileContent)
    } else {
      throw new Error(
        "Either kicadFilePath or kicadFileContent must be provided",
      )
    }

    const isPcbSnapshot = kicadFileType === "pcb"
    const kicadPcbContentForStyling = isPcbSnapshot
      ? (kicadFileContent ?? (await readFile(inputFilePath, "utf8")))
      : undefined
    const zoneFilledPolygonCountsByLayer = kicadPcbContentForStyling
      ? getZoneFilledPolygonCountsByLayer(kicadPcbContentForStyling)
      : undefined

    // Create output directory
    const outputDir = join(tempDir, "output")
    const generatedFileContent: Record<FilePath, FileContent> = {}

    if (kicadFileType === "3d") {
      const outputPng = join(outputDir, "temp_file.png")
      await $`mkdir -p ${outputDir}`
      const exportResult =
        await $`kicad-cli pcb render ${inputFilePath} -o ${outputPng} --width 800 --height 600 --rotate 45,0,45 --perspective --quality basic`

      if (exportResult.exitCode !== 0) {
        throw new Error(
          `kicad-cli 3D render failed with exit code ${exportResult.exitCode}\nStderr: ${exportResult.stderr}`,
        )
      }

      const pngBuffer = await readFile(outputPng)
      generatedFileContent["temp_file.png"] = pngBuffer

      return {
        exitCode: 0,
        generatedFileContent,
      }
    }

    // Export to SVG for sch/pcb
    const exportCmd =
      kicadFileType === "sch"
        ? $`kicad-cli sch export svg ${inputFilePath} -o ${outputDir} --theme Modern`
        : $`kicad-cli pcb export svg ${inputFilePath} -o ${join(outputDir, "temp_file.svg")} --layers B.Cu,In1.Cu,In2.Cu,F.Cu,F.SilkS,B.SilkS,F.Fab,B.Fab,F.CrtYd,B.CrtYd,Edge.Cuts --mode-single --page-size-mode 2 --exclude-drawing-sheet`

    const exportResult = await exportCmd

    if (exportResult.exitCode !== 0) {
      throw new Error(
        `kicad-cli export failed with exit code ${exportResult.exitCode}\nStderr: ${exportResult.stderr}`,
      )
    }

    // Read generated SVG file
    const svgFiles = await $`find ${outputDir} -name "*.svg"`.text()
    const svgFilePaths = svgFiles
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)

    if (svgFilePaths.length === 0) {
      throw new Error("No SVG files were generated")
    }

    // Convert each SVG to PNG using sharp
    for (const svgFilePath of svgFilePaths) {
      const rawSvgBuffer = await readFile(svgFilePath)
      const normalizedSvgBuffer = isPcbSnapshot
        ? Buffer.from(
            normalizePcbSvgForSnapshot(rawSvgBuffer.toString("utf8"), {
              pcbDrillHoleColor,
              pcbCopperPourOpacity,
              zoneFilledPolygonCountsByLayer,
            }),
          )
        : rawSvgBuffer
      let pngProcessor = sharp(normalizedSvgBuffer, { density: 100 })

      // For PCB files, scale 3x and add black background
      if (isPcbSnapshot) {
        const metadata = await pngProcessor.metadata()
        const width = (metadata.width || 0) * 3
        const height = (metadata.height || 0) * 3

        // Create black background
        const blackBg = await sharp({
          create: {
            width,
            height,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 1 },
          },
        })
          .png()
          .toBuffer()

        // Resize the PCB and composite on black background
        const resizedPng = await pngProcessor
          .resize(width, height, { fit: "fill" })
          .toBuffer()

        pngProcessor = sharp(blackBg).composite([{ input: resizedPng }])
      }

      const pngBuffer = await pngProcessor.png().toBuffer()

      const relativePath = svgFilePath
        .replace(`${outputDir}/`, "")
        .replace(".svg", ".png")
      generatedFileContent[relativePath] = pngBuffer
    }

    return {
      exitCode: 0,
      generatedFileContent,
    }
  } finally {
    // Cleanup temporary directory
    await rm(tempDir, { recursive: true, force: true })
  }
}
