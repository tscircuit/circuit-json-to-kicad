import { KicadLibraryConverter } from "../../lib/kicad-library/KicadLibraryConverter"
import type { KicadLibraryConverterOutput } from "../../lib/kicad-library/KicadLibraryConverterTypes"
import * as fs from "node:fs"
import * as path from "node:path"

export interface GeneratePcmAssetsOptions {
  /** Name of the library */
  libraryName: string
  /** Output directory for PCM assets */
  outputDir: string
  /** KiCad PCM package ID (e.g., com_tscircuit_author_library-name) */
  kicadPcmPackageId?: string
  /** Package version */
  version?: string
  /** Package description */
  description?: string
  /** Package author */
  author?: string
  /** Package maintainer */
  maintainer?: string
  /** Package license */
  license?: string
  /** Pre-generated KiCad library output (for testing without file system) */
  kicadLibraryOutput?: KicadLibraryConverterOutput
}

export interface GeneratePcmAssetsResult {
  /** Path to repository.json */
  repositoryJsonPath: string
  /** Path to packages.json */
  packagesJsonPath: string
  /** Path to the package zip file */
  packageZipPath: string
}

/**
 * Generates KiCad PCM (Package Content Manager) assets from a KiCad library output.
 *
 * This creates the directory structure expected by KiCad's Package Manager:
 * - repository.json - metadata about the PCM repository
 * - packages.json - list of packages
 * - packages/<package_id>_<version>.zip - the actual library files
 */
export async function generatePcmAssets(
  options: GeneratePcmAssetsOptions,
): Promise<GeneratePcmAssetsResult> {
  const {
    libraryName,
    outputDir,
    kicadLibraryOutput,
    version = "0.0.1",
    description = `KiCad library generated from tscircuit: ${libraryName}`,
    author = "tscircuit",
    maintainer = "tscircuit <hello@tscircuit.com>",
    license = "MIT",
  } = options

  if (!kicadLibraryOutput) {
    throw new Error(
      "kicadLibraryOutput is required. Use generatePcmAssetsFromFile for file-based generation.",
    )
  }

  // Derive package ID from library name
  const kicadPcmPackageId =
    options.kicadPcmPackageId ??
    `com_tscircuit_${libraryName.replace(/[^a-zA-Z0-9]/g, "_")}`

  // Create output directories
  fs.mkdirSync(outputDir, { recursive: true })
  const packagesDir = path.join(outputDir, "packages")
  fs.mkdirSync(packagesDir, { recursive: true })

  // Create a temporary directory for the package contents
  const tmpPackageDir = path.join(outputDir, ".tmp-package")
  fs.mkdirSync(tmpPackageDir, { recursive: true })

  // Write the library files to the temp directory
  for (const [filePath, content] of Object.entries(
    kicadLibraryOutput.kicadProjectFsMap,
  )) {
    const fullPath = path.join(tmpPackageDir, filePath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content)
  }

  // Create the package zip file
  const packageZipName = `${kicadPcmPackageId}_${version}.zip`
  const packageZipPath = path.join(packagesDir, packageZipName)

  // Use zip command to create the archive
  const zipProc = Bun.spawn(["zip", "-r", packageZipPath, "."], {
    cwd: tmpPackageDir,
    stdout: "pipe",
    stderr: "pipe",
  })
  await zipProc.exited

  // Calculate zip file size and hash
  const zipBuffer = fs.readFileSync(packageZipPath)
  const zipSize = zipBuffer.length
  const zipHash = await computeSha256(zipBuffer)

  // Clean up temp directory
  fs.rmSync(tmpPackageDir, { recursive: true, force: true })

  // Generate packages.json
  const packagesJson = {
    packages: [
      {
        author: {
          name: author,
        },
        description,
        download_sha256: zipHash,
        download_size: zipSize,
        download_url: `packages/${packageZipName}`,
        identifier: kicadPcmPackageId,
        install_size: zipSize * 2, // Approximate
        license,
        maintainer: {
          name: maintainer,
        },
        name: libraryName,
        resources: {},
        type: "library",
        versions: [version],
      },
    ],
  }

  const packagesJsonPath = path.join(outputDir, "packages.json")
  fs.writeFileSync(packagesJsonPath, JSON.stringify(packagesJson, null, 2))

  // Generate repository.json
  const repositoryJson = {
    $schema:
      "https://gitlab.com/kicad/code/kicad/-/raw/master/kicad/pcm/schemas/pcm.v1.schema.json",
    maintainer: {
      name: maintainer,
    },
    name: `${libraryName} PCM Repository`,
    packages: {
      sha256: await computeSha256(Buffer.from(JSON.stringify(packagesJson))),
      update_time_utc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      update_timestamp: Math.floor(Date.now() / 1000),
      url: "packages.json",
    },
  }

  const repositoryJsonPath = path.join(outputDir, "repository.json")
  fs.writeFileSync(repositoryJsonPath, JSON.stringify(repositoryJson, null, 2))

  return {
    repositoryJsonPath,
    packagesJsonPath,
    packageZipPath,
  }
}

export interface GeneratePcmAssetsFromFileOptions
  extends Omit<GeneratePcmAssetsOptions, "kicadLibraryOutput"> {
  /** Path to the library entrypoint file */
  filePath: string
}

/**
 * Generates KiCad PCM assets from a tscircuit library file.
 *
 * This function imports the file, builds circuit JSON for each exported component,
 * and generates the PCM directory structure.
 */
export async function generatePcmAssetsFromFile(
  options: GeneratePcmAssetsFromFileOptions,
): Promise<GeneratePcmAssetsResult> {
  const { filePath, libraryName, ...restOptions } = options

  // Derive package ID from library name
  const kicadPcmPackageId =
    options.kicadPcmPackageId ??
    `com_tscircuit_${libraryName.replace(/[^a-zA-Z0-9]/g, "_")}`

  // Import the library and get exports
  const libModule = await import(filePath)
  const exportNames = Object.keys(libModule).filter(
    (name) => name !== "default" && /^[A-Z]/.test(name),
  )

  // Build circuit JSON for each export
  const { Circuit } = await import("tscircuit")
  const circuitJsonMap: Record<string, any> = {}

  for (const exportName of exportNames) {
    const Component = libModule[exportName]
    if (typeof Component === "function") {
      try {
        const circuit = new Circuit()
        circuit.add(<Component />)
        await circuit.renderUntilSettled()
        circuitJsonMap[exportName] = circuit.getCircuitJson()
      } catch (e) {
        console.warn(`Warning: Could not render component ${exportName}:`, e)
      }
    }
  }

  // Create the KiCad library
  const converter = new KicadLibraryConverter({
    kicadLibraryName: libraryName,
    entrypoint: filePath,
    getExportsFromTsxFile: async () => exportNames,
    buildFileToCircuitJson: async (_filePath, componentName) =>
      circuitJsonMap[componentName] ?? null,
    includeBuiltins: true,
    isPcm: true,
    kicadPcmPackageId,
  })

  await converter.run()
  const kicadLibraryOutput = converter.getOutput()

  return generatePcmAssets({
    ...restOptions,
    libraryName,
    kicadLibraryOutput,
    kicadPcmPackageId,
  })
}

async function computeSha256(buffer: Buffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(buffer),
  )
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}
