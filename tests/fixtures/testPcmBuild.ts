import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import JSZip from "jszip"
import { convertToKicadLibrary, generatePcmAssets } from "@tscircuit/cli/lib"
import * as circuitJsonToKicadModule from "../../lib/index"

type FilePath = string
type FileContent = string

export interface TestPcmBuildOptions {
  fsMap: Record<FilePath, FileContent>
  startServerAndHang?: boolean
}

export interface TestPcmBuildFixture {
  zipFsMap: Record<FilePath, FileContent>
}

const PORT = 3847

function startPcmServer(pcmOutputDir: string): void {
  const server = Bun.serve({
    port: PORT,
    fetch(req) {
      const url = new URL(req.url)
      let filePath = path.join(pcmOutputDir, url.pathname.replace(/^\/pcm/, ""))

      if (
        url.pathname === "/" ||
        url.pathname === "" ||
        url.pathname === "/pcm" ||
        url.pathname === "/pcm/"
      ) {
        filePath = path.join(pcmOutputDir, "repository.json")
      }

      if (!fs.existsSync(filePath)) {
        return new Response("Not found", { status: 404 })
      }

      const stat = fs.statSync(filePath)
      if (stat.isDirectory()) {
        const files = fs.readdirSync(filePath)
        return new Response(JSON.stringify(files, null, 2), {
          headers: { "Content-Type": "application/json" },
        })
      }

      const content = fs.readFileSync(filePath)
      const ext = path.extname(filePath).toLowerCase()

      const contentTypes: Record<string, string> = {
        ".json": "application/json",
        ".zip": "application/zip",
        ".png": "image/png",
        ".svg": "image/svg+xml",
      }

      return new Response(content, {
        headers: {
          "Content-Type": contentTypes[ext] || "application/octet-stream",
          "Access-Control-Allow-Origin": "*",
        },
      })
    },
  })

  const repositoryUrl = `http://localhost:${PORT}/pcm/repository.json`

  console.log("\n" + "=".repeat(60))
  console.log("PCM Server running!")
  console.log("=".repeat(60))
  console.log(`\nRepository URL (paste into KiCad Package Manager):`)
  console.log(`\n  ${repositoryUrl}\n`)
  console.log("Press Ctrl+C to stop the server")
  console.log("=".repeat(60) + "\n")

  process.on("SIGINT", () => {
    console.log("\nShutting down server...")
    server.stop()
    process.exit(0)
  })
}

/**
 * Test helper that builds PCM assets from TSX source files.
 * Writes files to a temp directory, converts to KiCad, generates PCM, and returns the zip contents.
 */
export async function testPcmBuild(
  options: TestPcmBuildOptions,
): Promise<TestPcmBuildFixture> {
  const { fsMap, startServerAndHang = false } = options

  // Create temp directories
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pcm-test-"))
  const srcDir = path.join(tmpDir, "src")
  const kicadLibDir = path.join(tmpDir, "kicad-library")
  const pcmOutputDir = path.join(tmpDir, "pcm-output")

  // Write fsMap to disk
  for (const [filePath, content] of Object.entries(fsMap)) {
    const fullPath = path.join(srcDir, filePath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content)
  }

  // Symlink node_modules so imports work
  const projectRoot = path.resolve(__dirname, "../..")
  fs.symlinkSync(
    path.join(projectRoot, "node_modules"),
    path.join(srcDir, "node_modules"),
  )

  // Find the entrypoint (index.tsx or first .tsx file)
  const entrypoint = Object.keys(fsMap).find(
    (f) => f === "index.tsx" || f.endsWith(".tsx"),
  )
  if (!entrypoint) {
    throw new Error("No .tsx entrypoint found in fsMap")
  }

  // Convert TSX to KiCad library
  await convertToKicadLibrary({
    filePath: path.join(srcDir, entrypoint),
    libraryName: "test-library",
    outputDir: kicadLibDir,
    isPcm: true,
    kicadPcmPackageId: "com_tscircuit_test_library",
    circuitJsonToKicadModule,
  })

  // Generate PCM assets
  await generatePcmAssets({
    packageName: "test-library",
    version: "0.0.1",
    author: "tscircuit",
    description: "Test library",
    kicadLibraryPath: kicadLibDir,
    outputDir: pcmOutputDir,
    baseUrl: `http://localhost:${PORT}`,
  })

  // Find and extract the zip file
  const files = fs.readdirSync(pcmOutputDir)
  const zipFileName = files.find((f) => f.endsWith(".zip"))
  if (!zipFileName) {
    throw new Error("No zip file generated")
  }

  const zipPath = path.join(pcmOutputDir, zipFileName)
  const zipData = fs.readFileSync(zipPath)
  const zip = await JSZip.loadAsync(zipData)

  // Extract zip contents to fsMap
  const zipFsMap: Record<FilePath, FileContent> = {}
  for (const [relativePath, file] of Object.entries(zip.files)) {
    if (!file.dir) {
      zipFsMap[relativePath] = await file.async("string")
    }
  }

  if (startServerAndHang) {
    startPcmServer(pcmOutputDir)
    // Hang forever
    await new Promise(() => {})
  }

  // Cleanup temp directory
  fs.rmSync(tmpDir, { recursive: true, force: true })

  return { zipFsMap }
}
