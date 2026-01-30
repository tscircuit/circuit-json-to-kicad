#!/usr/bin/env bun
/**
 * Script to run a PCM server for a tscircuit library directory.
 *
 * Usage: bun run pcm-server ./path/to/library
 *
 * This script:
 * 1. Generates KiCad PCM assets from the library
 * 2. Starts a local HTTP server to serve the PCM directory
 * 3. Logs the URL to repository.json for pasting into KiCad
 */

import { generatePcmAssetsFromFile } from "./pcm/generatePcmAssets"
import * as path from "node:path"
import * as fs from "node:fs"

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

// Output directory for PCM assets
const outputDir = path.join(libraryDir, ".pcm-output")

console.log(`Generating PCM assets for: ${libraryName}`)
console.log(`Entrypoint: ${entrypoint}`)
console.log(`Output directory: ${outputDir}`)

// Generate PCM assets from the library file
const result = await generatePcmAssetsFromFile({
  filePath: entrypoint,
  libraryName,
  outputDir,
})

console.log("\nPCM assets generated successfully!")
console.log(`Files written to: ${outputDir}`)

// Start HTTP server to serve the PCM directory
const PORT = 3847

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    let filePath = path.join(outputDir, url.pathname)

    // Handle directory requests
    if (url.pathname === "/" || url.pathname === "") {
      // Serve index or redirect to repository.json
      filePath = path.join(outputDir, "repository.json")
    }

    if (!fs.existsSync(filePath)) {
      return new Response("Not found", { status: 404 })
    }

    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) {
      // List directory contents as JSON
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

const repositoryUrl = `http://localhost:${PORT}/repository.json`

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
