#!/usr/bin/env bun
/**
 * KiCad File Comparison Utility
 *
 * Compares two KiCad files or directories semantically, normalizing:
 * - UUIDs (replaced with placeholder)
 * - Timestamps and generator info
 * - Version numbers
 *
 * Usage:
 *   bun run scripts/compare-kicad-files.ts <file1> <file2>
 *   bun run scripts/compare-kicad-files.ts <dir1> <dir2>
 *
 * Examples:
 *   bun run scripts/compare-kicad-files.ts ./generated/footprint.kicad_mod ./reference/footprint.kicad_mod
 *   bun run scripts/compare-kicad-files.ts ./generated/footprints/lib.pretty ./reference/footprints/lib.pretty
 */

import { parseKicadMod, parseKicadSexpr } from "kicadts"
import * as fs from "node:fs"
import * as path from "node:path"

const args = process.argv.slice(2)

if (args.length !== 2) {
  console.error("Usage: bun run scripts/compare-kicad-files.ts <path1> <path2>")
  console.error("Paths can be files or directories containing .kicad_mod files")
  process.exit(1)
}

const [path1, path2] = args.map((p) => path.resolve(p)) as [string, string]

/**
 * Normalize a KiCad S-expression string by removing volatile elements
 */
function normalizeKicadContent(content: string): string {
  let normalized = content

  // Remove UUIDs (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
  normalized = normalized.replace(
    /\(uuid "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"\)/gi,
    '(uuid "NORMALIZED_UUID")',
  )

  // Remove tstamp values
  normalized = normalized.replace(/\(tstamp [^)]+\)/g, "(tstamp NORMALIZED)")

  // Normalize version numbers
  normalized = normalized.replace(/\(version \d+\)/g, "(version NORMALIZED)")

  // Normalize generator info
  normalized = normalized.replace(
    /\(generator "[^"]*"\)/g,
    '(generator "NORMALIZED")',
  )
  normalized = normalized.replace(
    /\(generator_version "[^"]*"\)/g,
    '(generator_version "NORMALIZED")',
  )

  return normalized
}

/**
 * Parse and get normalized string representation of a KiCad file
 */
function parseAndNormalize(filePath: string): { parsed: string; raw: string } {
  const content = fs.readFileSync(filePath, "utf-8")
  const ext = path.extname(filePath).toLowerCase()

  try {
    if (ext === ".kicad_mod") {
      const parsed = parseKicadMod(content)
      return {
        parsed: normalizeKicadContent(parsed.getString()),
        raw: normalizeKicadContent(content),
      }
    } else {
      // Generic S-expression parsing
      const parsed = parseKicadSexpr(content)
      const parsedStr = parsed.map((p) => p.getString()).join("\n")
      return {
        parsed: normalizeKicadContent(parsedStr),
        raw: normalizeKicadContent(content),
      }
    }
  } catch (e) {
    console.warn(
      `Warning: Could not parse ${filePath}, using raw content: ${e}`,
    )
    return {
      parsed: normalizeKicadContent(content),
      raw: normalizeKicadContent(content),
    }
  }
}

/**
 * Get list of KiCad files in a directory
 */
function getKicadFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) {
    return []
  }

  const stat = fs.statSync(dirPath)
  if (!stat.isDirectory()) {
    return [dirPath]
  }

  const files = fs.readdirSync(dirPath)
  return files
    .filter(
      (f) =>
        f.endsWith(".kicad_mod") ||
        f.endsWith(".kicad_sym") ||
        f.endsWith(".kicad_pcb"),
    )
    .map((f) => path.join(dirPath, f))
    .sort()
}

/**
 * Compare two strings line by line and return differences
 */
function diffStrings(
  str1: string,
  str2: string,
  label1: string,
  label2: string,
): string[] {
  const lines1 = str1.split("\n")
  const lines2 = str2.split("\n")
  const diffs: string[] = []

  const maxLines = Math.max(lines1.length, lines2.length)

  for (let i = 0; i < maxLines; i++) {
    const line1 = lines1[i] ?? ""
    const line2 = lines2[i] ?? ""

    if (line1 !== line2) {
      diffs.push(`Line ${i + 1}:`)
      if (line1) diffs.push(`  ${label1}: ${line1.trim()}`)
      if (line2) diffs.push(`  ${label2}: ${line2.trim()}`)
    }
  }

  return diffs
}

/**
 * Compare two KiCad files
 */
function compareFiles(
  file1: string,
  file2: string,
): {
  identical: boolean
  differences: string[]
} {
  const content1 = parseAndNormalize(file1)
  const content2 = parseAndNormalize(file2)

  if (content1.parsed === content2.parsed) {
    return { identical: true, differences: [] }
  }

  const differences = diffStrings(
    content1.parsed,
    content2.parsed,
    "Generated",
    "User-modified",
  )

  return { identical: false, differences }
}

// Main comparison logic
const stat1 = fs.existsSync(path1) ? fs.statSync(path1) : null
const stat2 = fs.existsSync(path2) ? fs.statSync(path2) : null

if (!stat1) {
  console.error(`Error: Path not found: ${path1}`)
  process.exit(1)
}

if (!stat2) {
  console.error(`Error: Path not found: ${path2}`)
  process.exit(1)
}

const isDir1 = stat1.isDirectory()
const isDir2 = stat2.isDirectory()

if (isDir1 !== isDir2) {
  console.error("Error: Both paths must be either files or directories")
  process.exit(1)
}

if (!isDir1) {
  // Compare single files
  console.log(`Comparing files:`)
  console.log(`  Generated: ${path1}`)
  console.log(`  User-modified: ${path2}`)
  console.log("")

  const result = compareFiles(path1, path2)

  if (result.identical) {
    console.log("✓ Files are semantically identical (after normalization)")
  } else {
    console.log("✗ Files differ:")
    console.log("")
    for (const diff of result.differences.slice(0, 100)) {
      console.log(diff)
    }
    if (result.differences.length > 100) {
      console.log(`... and ${result.differences.length - 100} more differences`)
    }
  }
} else {
  // Compare directories
  console.log(`Comparing directories:`)
  console.log(`  Generated: ${path1}`)
  console.log(`  User-modified: ${path2}`)
  console.log("")

  const files1 = getKicadFiles(path1)
  const files2 = getKicadFiles(path2)

  const names1 = new Set(files1.map((f) => path.basename(f)))
  const names2 = new Set(files2.map((f) => path.basename(f)))

  // Files only in generated
  const onlyInGenerated = [...names1].filter((n) => !names2.has(n))
  // Files only in user-modified
  const onlyInUserModified = [...names2].filter((n) => !names1.has(n))
  // Files in both
  const inBoth = [...names1].filter((n) => names2.has(n))

  if (onlyInGenerated.length > 0) {
    console.log("Files only in generated:")
    for (const name of onlyInGenerated) {
      console.log(`  - ${name}`)
    }
    console.log("")
  }

  if (onlyInUserModified.length > 0) {
    console.log("Files only in user-modified:")
    for (const name of onlyInUserModified) {
      console.log(`  + ${name}`)
    }
    console.log("")
  }

  // Compare common files
  let identicalCount = 0
  let differentCount = 0

  console.log("Comparing common files:")
  console.log("")

  for (const name of inBoth) {
    const file1 = path.join(path1, name)
    const file2 = path.join(path2, name)

    const result = compareFiles(file1, file2)

    if (result.identical) {
      identicalCount++
      console.log(`✓ ${name} - identical`)
    } else {
      differentCount++
      console.log(`✗ ${name} - differs:`)
      for (const diff of result.differences.slice(0, 20)) {
        console.log(`    ${diff}`)
      }
      if (result.differences.length > 20) {
        console.log(
          `    ... and ${result.differences.length - 20} more differences`,
        )
      }
      console.log("")
    }
  }

  console.log("")
  console.log("Summary:")
  console.log(`  Identical: ${identicalCount}`)
  console.log(`  Different: ${differentCount}`)
  console.log(`  Only in generated: ${onlyInGenerated.length}`)
  console.log(`  Only in user-modified: ${onlyInUserModified.length}`)
}
