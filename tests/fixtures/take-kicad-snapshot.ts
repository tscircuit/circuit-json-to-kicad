import { $ } from "bun"
import { tmpdir } from "node:os"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
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
const KEEP_OUT_OVERLAY_MARGIN = 0.05

interface Point {
  x: number
  y: number
}

const findSexprBlocks = (source: string, token: string): string[] => {
  const blocks: string[] = []
  let searchIndex = 0
  const tokenStart = `(${token}`

  while (searchIndex < source.length) {
    const start = source.indexOf(tokenStart, searchIndex)
    if (start === -1) break

    let depth = 0
    let inString = false
    let escaped = false

    for (let index = start; index < source.length; index++) {
      const char = source[index]

      if (inString) {
        if (escaped) {
          escaped = false
        } else if (char === "\\") {
          escaped = true
        } else if (char === '"') {
          inString = false
        }
        continue
      }

      if (char === '"') {
        inString = true
      } else if (char === "(") {
        depth++
      } else if (char === ")") {
        depth--
        if (depth === 0) {
          blocks.push(source.slice(start, index + 1))
          searchIndex = index + 1
          break
        }
      }
    }

    if (searchIndex <= start) break
  }

  return blocks
}

const parsePointMatches = (source: string, regex: RegExp): Point[] =>
  [...source.matchAll(regex)].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
  }))

const getKeepoutZonePolygons = (kicadPcbContent: string): Point[][] =>
  findSexprBlocks(kicadPcbContent, "zone")
    .filter((zoneBlock) => zoneBlock.includes("(keepout"))
    .map((zoneBlock) =>
      parsePointMatches(
        zoneBlock,
        /\(xy\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\)/g,
      ),
    )
    .filter((points) => points.length >= 3)

const getEdgeCutPoints = (kicadPcbContent: string): Point[] =>
  findSexprBlocks(kicadPcbContent, "gr_line")
    .filter((block) => block.includes("Edge.Cuts"))
    .flatMap((block) =>
      parsePointMatches(
        block,
        /\((?:start|end)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\)/g,
      ),
    )

export const addPcbKeepoutOverlaysToSvg = (
  svg: string,
  kicadPcbContent?: string,
): string => {
  if (!kicadPcbContent) return svg

  const keepoutPolygons = getKeepoutZonePolygons(kicadPcbContent)
  if (keepoutPolygons.length === 0) return svg

  const bboxPoints = [
    ...getEdgeCutPoints(kicadPcbContent),
    ...keepoutPolygons.flat(),
  ]
  if (bboxPoints.length === 0) return svg

  const minX = Math.min(...bboxPoints.map((point) => point.x))
  const minY = Math.min(...bboxPoints.map((point) => point.y))
  const toSvgPoint = (point: Point) =>
    `${point.x - minX + KEEP_OUT_OVERLAY_MARGIN},${point.y - minY + KEEP_OUT_OVERLAY_MARGIN}`

  const overlay = `
<defs>
  <pattern id="cj2k-keepout-hatch" patternUnits="userSpaceOnUse" width="0.6" height="0.6">
    <path d="M-0.15 0.6 L0.6 -0.15 M0 0.75 L0.75 0" style="stroke:#ff5d5d; stroke-width:0.08" />
  </pattern>
</defs>
<g data-cj2k-keepout-overlays="true" style="fill:url(#cj2k-keepout-hatch); fill-opacity:1; stroke:#ff5d5d; stroke-width:0.05; stroke-opacity:1">
${keepoutPolygons
  .map((points) => `  <polygon points="${points.map(toSvgPoint).join(" ")}" />`)
  .join("\n")}
</g>
`

  return svg.replace("</svg>", `${overlay}</svg>`)
}

/**
 * KiCad 10 renders circular drill holes as filled black circles and pill/oval
 * drill holes as black stroked round-cap paths in SVG exports. This helper can
 * remap those hole colors for snapshot readability without changing the KiCad
 * PCB data itself.
 */
export function normalizePcbSvgForSnapshot(
  svg: string,
  pcbDrillHoleColor?: string,
  kicadPcbContent?: string,
): string {
  const svgWithKeepouts = addPcbKeepoutOverlaysToSvg(svg, kicadPcbContent)

  if (!pcbDrillHoleColor) return svgWithKeepouts

  const drillFillStyle = `fill:${pcbDrillHoleColor}; fill-opacity:1.0000; stroke:none;`

  return svgWithKeepouts
    .replaceAll(KICAD_10_DRILL_FILL_STYLE, drillFillStyle)
    .replace(KICAD_10_OVAL_HOLE_STROKE_REGEX, `$1${pcbDrillHoleColor}$2`)
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
}): Promise<KicadOutput> => {
  const { kicadFilePath, kicadFileContent, kicadFileType, pcbDrillHoleColor } =
    params

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

    // Create output directory
    const outputDir = join(tempDir, "output")

    const generatedFileContent: Record<FilePath, FileContent> = {}

    // Handle 3D rendering separately (outputs PNG directly)
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
    const resolvedKicadFileContent =
      kicadFileType === "pcb"
        ? (kicadFileContent ?? (await readFile(inputFilePath, "utf8")))
        : undefined

    for (const svgFilePath of svgFilePaths) {
      const rawSvgBuffer = await readFile(svgFilePath)
      const normalizedSvgBuffer =
        kicadFileType === "pcb"
          ? Buffer.from(
              normalizePcbSvgForSnapshot(
                rawSvgBuffer.toString("utf8"),
                pcbDrillHoleColor,
                resolvedKicadFileContent,
              ),
            )
          : rawSvgBuffer
      let pngProcessor = sharp(normalizedSvgBuffer, { density: 100 })

      // For PCB files, scale 3x and add black background
      if (kicadFileType === "pcb") {
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
