import { test, expect } from "bun:test"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { CircuitJson } from "circuit-json"
import JSZip from "jszip"
import { generatePcmAssets } from "../../scripts/pcm/generatePcmAssets"
import { KicadLibraryConverter } from "lib/kicad-library/KicadLibraryConverter"
import { Circuit } from "tscircuit"

/**
 * Helper to recursively list all files in a directory
 */
function listFilesRecursively(dir: string, baseDir: string = dir): string[] {
  const files: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    const relativePath = path.relative(baseDir, fullPath)

    if (entry.isDirectory()) {
      files.push(`${relativePath}/`)
      files.push(...listFilesRecursively(fullPath, baseDir))
    } else {
      files.push(relativePath)
    }
  }

  return files.sort()
}

/**
 * Helper to list files inside a zip archive
 */
async function listZipContents(zipPath: string): Promise<string[]> {
  const zipData = fs.readFileSync(zipPath)
  const zip = await JSZip.loadAsync(zipData)
  const files: string[] = []

  for (const relativePath of Object.keys(zip.files)) {
    files.push(relativePath)
  }

  return files.sort()
}

// Mock component: MyResistor
async function renderMyResistor(): Promise<CircuitJson> {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <resistor name="R1" resistance="10k" footprint="0402" />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson() as CircuitJson
}

// Mock component: MyCapacitor
async function renderMyCapacitor(): Promise<CircuitJson> {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <capacitor name="C1" capacitance="100nF" footprint="0805" />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson() as CircuitJson
}

test("generatePcmAssets generates correct PCM directory structure", async () => {
  // Create a temporary directory for the test
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pcm-test-"))
  const outputDir = path.join(tmpDir, "pcm-output")

  // Build mock circuit JSON
  const mockCircuitJson: Record<string, CircuitJson> = {
    MyResistor: await renderMyResistor(),
    MyCapacitor: await renderMyCapacitor(),
  }

  // Create the KiCad library using mocks (same pattern as existing tests)
  const converter = new KicadLibraryConverter({
    kicadLibraryName: "test-library",
    entrypoint: "lib/test-library.ts",
    getExportsFromTsxFile: async () => ["MyResistor", "MyCapacitor"],
    buildFileToCircuitJson: async (_filePath, componentName) =>
      mockCircuitJson[componentName] ?? null,
    includeBuiltins: true,
    isPcm: true,
    kicadPcmPackageId: "com_tscircuit_test_library",
  })

  await converter.run()
  const kicadLibraryOutput = converter.getOutput()

  try {
    // Generate PCM assets
    await generatePcmAssets({
      libraryName: "test-library",
      outputDir,
      kicadLibraryOutput,
      kicadPcmPackageId: "com_tscircuit_test_library",
    })

    // List all files in the output directory
    const fileTree = listFilesRecursively(outputDir)

    // Snapshot the file tree structure
    expect(fileTree).toMatchInlineSnapshot(`
[
  "packages.json",
  "packages/",
  "packages/com_tscircuit_test_library_0.0.1.zip",
  "repository.json",
]
`)

    // List files inside the zip
    const zipPath = path.join(
      outputDir,
      "packages",
      "com_tscircuit_test_library_0.0.1.zip",
    )
    const zipContents = await listZipContents(zipPath)

    // Snapshot the zip contents
    expect(zipContents).toMatchInlineSnapshot(`
[
  "footprints/",
  "footprints/tscircuit_builtin.pretty/",
  "footprints/tscircuit_builtin.pretty/capacitor_0805.kicad_mod",
  "footprints/tscircuit_builtin.pretty/resistor_0402.kicad_mod",
  "fp-lib-table",
  "sym-lib-table",
  "symbols/",
  "symbols/tscircuit_builtin.kicad_sym",
]
`)
  } finally {
    // Cleanup temporary directory
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})
