#!/usr/bin/env bun
/**
 * Script to build a KiCad library from a tscircuit library directory.
 *
 * Usage: bun run kicad-library ./path/to/library
 *
 * This script:
 * 1. Reads tscircuit.config.json for library settings
 * 2. Converts the tscircuit library to KiCad format using local circuit-json-to-kicad
 * 3. Outputs to <path>/dist/kicad-library
 */

import { convertToKicadLibrary } from "@tscircuit/cli/lib"
import * as path from "node:path"
import * as fs from "node:fs"
import * as circuitJsonToKicadModule from "../lib/index"

const args = process.argv.slice(2)

const libraryArg = args[0]
if (!libraryArg) {
  console.error("Usage: bun run kicad-library <library-directory>")
  console.error("Example: bun run kicad-library ./DO_NOT_COMMIT/library")
  process.exit(1)
}

const libraryDir = path.resolve(libraryArg)

if (!fs.existsSync(libraryDir)) {
  console.error(`Error: Directory not found: ${libraryDir}`)
  process.exit(1)
}

// Read tscircuit.config.json
const configPath = path.join(libraryDir, "tscircuit.config.json")
if (!fs.existsSync(configPath)) {
  console.error(`Error: tscircuit.config.json not found in ${libraryDir}`)
  process.exit(1)
}

interface TscircuitConfig {
  mainEntrypoint?: string
  kicadLibraryEntrypointPath?: string
  kicadLibraryName?: string
  build?: {
    kicadLibrary?: boolean
    kicadPcm?: boolean
  }
}

let config: TscircuitConfig
try {
  config = JSON.parse(fs.readFileSync(configPath, "utf-8"))
} catch (e) {
  console.error(`Error: Failed to parse tscircuit.config.json: ${e}`)
  process.exit(1)
}

// Get library name from config or derive from directory
const libraryName = config.kicadLibraryName || path.basename(libraryDir)

// Find the entrypoint
let entrypoint: string | null = null

if (config.kicadLibraryEntrypointPath) {
  const configuredPath = path.join(libraryDir, config.kicadLibraryEntrypointPath)
  if (fs.existsSync(configuredPath)) {
    entrypoint = configuredPath
  } else {
    console.error(`Error: Configured kicadLibraryEntrypointPath not found: ${config.kicadLibraryEntrypointPath}`)
    process.exit(1)
  }
} else {
  // Fallback to common entrypoint locations
  const entrypointCandidates = [
    "index.ts",
    "index.tsx",
    "lib/index.ts",
    "lib/index.tsx",
  ]

  for (const candidate of entrypointCandidates) {
    const candidatePath = path.join(libraryDir, candidate)
    if (fs.existsSync(candidatePath)) {
      entrypoint = candidatePath
      break
    }
  }
}

if (!entrypoint) {
  console.error(`Error: Could not find entrypoint in ${libraryDir}`)
  console.error("Set kicadLibraryEntrypointPath in tscircuit.config.json or create index.ts/index.tsx")
  process.exit(1)
}

// Output directory
const outputDir = path.join(libraryDir, "dist", "kicad-library")

console.log(`Building KiCad library: ${libraryName}`)
console.log(`Entrypoint: ${entrypoint}`)
console.log(`Output directory: ${outputDir}`)

// Read package.json for metadata if it exists
const packageJsonPath = path.join(libraryDir, "package.json")
let kicadPcmPackageId = `com_tscircuit_${libraryName}`.replace(/[^a-zA-Z0-9_]/g, "_")

if (fs.existsSync(packageJsonPath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"))
    const author = pkg.author?.name || pkg.author || "tscircuit"
    kicadPcmPackageId = `com_tscircuit_${author}_${libraryName}`.replace(/[^a-zA-Z0-9_]/g, "_")
  } catch {
    // Ignore package.json parse errors
  }
}

// Convert to KiCad library using CLI's convertToKicadLibrary with local module injection
console.log("\nConverting to KiCad library...")
await convertToKicadLibrary({
  filePath: entrypoint,
  libraryName,
  outputDir,
  isPcm: false,
  kicadPcmPackageId,
  circuitJsonToKicadModule,
})

console.log("\nKiCad library built successfully!")
console.log(`Files written to: ${outputDir}`)
