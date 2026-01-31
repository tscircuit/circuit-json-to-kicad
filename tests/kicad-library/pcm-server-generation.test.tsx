import { test, expect } from "bun:test"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { CircuitJson } from "circuit-json"
import JSZip from "jszip"
import { generatePcmAssets } from "@tscircuit/cli/lib"
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
  const kicadLibOutputDir = path.join(tmpDir, "kicad-library")
  const pcmOutputDir = path.join(tmpDir, "pcm-output")

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
    // Write kicad library files to disk (CLI's generatePcmAssets expects a path)
    fs.mkdirSync(kicadLibOutputDir, { recursive: true })
    for (const [relativePath, content] of Object.entries(
      kicadLibraryOutput.kicadProjectFsMap,
    )) {
      const fullPath = path.join(kicadLibOutputDir, relativePath)
      fs.mkdirSync(path.dirname(fullPath), { recursive: true })
      fs.writeFileSync(fullPath, content)
    }

    // Generate PCM assets using CLI's generatePcmAssets
    await generatePcmAssets({
      packageName: "test-library",
      version: "0.0.1",
      author: "tscircuit",
      description: "Test library",
      kicadLibraryPath: kicadLibOutputDir,
      outputDir: pcmOutputDir,
      baseUrl: "http://localhost:3847",
    })

    // List all files in the output directory
    const fileTree = listFilesRecursively(pcmOutputDir)

    // Snapshot the file tree structure (CLI generates slightly different structure)
    expect(fileTree).toMatchInlineSnapshot(`
[
  "com.tscircuit.tscircuit.test-library-0.0.1.zip",
  "packages.json",
  "repository.json",
]
`)

    // Find the zip file
    const zipFile = fileTree.find((f) => f.endsWith(".zip"))
    expect(zipFile).toBeDefined()

    const zipPath = path.join(pcmOutputDir, zipFile!)
    const zipContents = await listZipContents(zipPath)

    // Snapshot the zip contents
    expect(zipContents).toMatchInlineSnapshot(`
[
  "footprints/",
  "footprints/tscircuit_builtin.pretty/",
  "footprints/tscircuit_builtin.pretty/capacitor_0805.kicad_mod",
  "footprints/tscircuit_builtin.pretty/resistor_0402.kicad_mod",
  "metadata.json",
  "symbols/",
  "symbols/tscircuit_builtin.kicad_sym",
]
`)
  } finally {
    // Cleanup temporary directory
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})
