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

/**
 * Executes kicad-cli commands e.g.
 * - kicad-cli sch export svg ./flat_hierarchy.kicad_sch -o out/svg --theme "Modern" --no-background-color
 *
 * ...and returns the outputs
 */
export const takeKicadSnapshot = async (params: {
  kicadFilePath?: string
  kicadFileContent?: string
  kicadFileType: "sch" | "pcb"
}): Promise<KicadOutput> => {
  const { kicadFilePath, kicadFileContent, kicadFileType } = params

  // Check to make sure kicad-cli is installed
  const kicadCliVersion = await $`kicad-cli --version`

  if (!kicadCliVersion.stdout.toString().trim().startsWith("9.")) {
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
      inputFilePath = join(
        tempDir,
        `temp_file.kicad_${kicadFileType === "sch" ? "sch" : "pcb"}`,
      )
      await writeFile(inputFilePath, kicadFileContent)
    } else {
      throw new Error(
        "Either kicadFilePath or kicadFileContent must be provided",
      )
    }

    // Create output directory
    const outputDir = join(tempDir, "output")

    // Export to SVG
    const exportCmd =
      kicadFileType === "sch"
        ? $`kicad-cli sch export svg ${inputFilePath} -o ${outputDir} --theme Modern`
        : $`kicad-cli pcb export svg ${inputFilePath} -o ${join(outputDir, "temp_file.svg")} --layers B.Cu,F.Cu,F.SilkS,B.SilkS,Edge.Cuts --mode-single --page-size-mode 2 --exclude-drawing-sheet`

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

    const generatedFileContent: Record<FilePath, FileContent> = {}

    // Convert each SVG to PNG using sharp
    for (const svgFilePath of svgFilePaths) {
      const svgBuffer = await readFile(svgFilePath)
      let pngProcessor = sharp(svgBuffer, { density: 100 })

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
