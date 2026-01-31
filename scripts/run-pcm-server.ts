#!/usr/bin/env bun
/**
 * Script to run a PCM server for a tscircuit library directory.
 *
 * Usage: bun run pcm-server ./path/to/library
 *
 * This script:
 * 1. Generates KiCad PCM assets from the library using @tscircuit/cli
 * 2. Starts a local HTTP server to serve the PCM directory
 * 3. Logs the URL to repository.json for pasting into KiCad
 */

import { convertToKicadLibrary, generatePcmAssets } from "@tscircuit/cli/lib"
import * as path from "node:path"
import * as fs from "node:fs"
import * as circuitJsonToKicadModule from "../lib/index"

const args = process.argv.slice(2)

const libraryArg = args[0]
if (!libraryArg) {
  console.error("Usage: bun run pcm-server <library-directory>")
  console.error("Example: bun run pcm-server ./DO_NOT_COMMIT/library")
  process.exit(1)
}

const libraryDir = path.resolve(libraryArg)

if (!fs.existsSync(libraryDir)) {
  console.error(`Error: Directory not found: ${libraryDir}`)
  process.exit(1)
}

// Find the library entrypoint (index.ts or index.tsx)
const entrypointCandidates = [
  "index.ts",
  "index.tsx",
  "lib/index.ts",
  "lib/index.tsx",
]
let entrypoint: string | null = null

for (const candidate of entrypointCandidates) {
  const candidatePath = path.join(libraryDir, candidate)
  if (fs.existsSync(candidatePath)) {
    entrypoint = candidatePath
    break
  }
}

if (!entrypoint) {
  console.error(`Error: Could not find entrypoint in ${libraryDir}`)
  console.error("Looked for: " + entrypointCandidates.join(", "))
  process.exit(1)
}

// Derive library name from directory name
const libraryName = path.basename(libraryDir)

// Output directories
const outputDir = path.join(libraryDir, ".pcm-output")
const kicadLibOutputDir = path.join(outputDir, "kicad-library")
const pcmOutputDir = path.join(outputDir, "pcm")

console.log(`Generating PCM assets for: ${libraryName}`)
console.log(`Entrypoint: ${entrypoint}`)
console.log(`Output directory: ${outputDir}`)

// Read package.json for metadata if it exists
let version = "0.0.1"
let author = "tscircuit"
let description = ""
const packageJsonPath = path.join(libraryDir, "package.json")
if (fs.existsSync(packageJsonPath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"))
    version = pkg.version || version
    author = pkg.author?.name || pkg.author || author
    description = pkg.description || description
  } catch {
    // Ignore package.json parse errors
  }
}

const kicadPcmPackageId = `com_tscircuit_${author}_${libraryName}`.replace(
  /[^a-zA-Z0-9_]/g,
  "_",
)

// Convert to KiCad library using CLI's convertToKicadLibrary
console.log("Converting to KiCad library...")
await convertToKicadLibrary({
  filePath: entrypoint,
  libraryName,
  outputDir: kicadLibOutputDir,
  isPcm: true,
  kicadPcmPackageId,
  circuitJsonToKicadModule,
})

// Generate PCM assets using CLI's generatePcmAssets
const PORT = 3847
const baseUrl = `http://localhost:${PORT}`

console.log("Generating PCM assets...")
await generatePcmAssets({
  packageName: libraryName,
  version,
  author,
  description,
  kicadLibraryPath: kicadLibOutputDir,
  outputDir: pcmOutputDir,
  baseUrl,
})

console.log("\nPCM assets generated successfully!")
console.log(`Files written to: ${pcmOutputDir}`)

// Start HTTP server to serve the PCM directory
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    let filePath = path.join(pcmOutputDir, url.pathname.replace(/^\/pcm/, ""))

    // Handle root/repository.json requests
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

const repositoryUrl = `${baseUrl}/pcm/repository.json`

console.log("\n" + "=".repeat(60))
console.log("PCM Server running!")
console.log("=".repeat(60))
console.log(`\nRepository URL (paste into KiCad Package Manager):`)
console.log(`\n  ${repositoryUrl}\n`)
console.log("Press Ctrl+C to stop the server")
console.log("=".repeat(60) + "\n")

// Keep the server running
process.on("SIGINT", () => {
  console.log("\nShutting down server...")
  server.stop()
  process.exit(0)
})
