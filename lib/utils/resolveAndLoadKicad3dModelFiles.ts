type ModelFetchResponse = {
  ok: boolean
  arrayBuffer: () => Promise<ArrayBuffer>
}

export interface LoadedKicad3dModelFile {
  sourcePath: string
  outputPath: string
  content: Uint8Array
}

export interface Kicad3dModelLoadError {
  sourcePath: string
  error: unknown
}

export interface ResolveAndLoadKicad3dModelFilesOptions {
  model3dSourcePaths: string[]
  projectName: string
  fetch: (modelPath: string) => Promise<ModelFetchResponse>
  readFile?: (modelPath: string) => Promise<ArrayBuffer | Uint8Array>
  onModelFile: (file: LoadedKicad3dModelFile) => void | Promise<void>
  onError?: (error: Kicad3dModelLoadError) => void | Promise<void>
}

const isRemotePath = (modelPath: string) =>
  modelPath.startsWith("http://") || modelPath.startsWith("https://")

const isBuiltinModelPath = (modelPath: string) =>
  modelPath.startsWith("http://modelcdn.tscircuit.com") ||
  modelPath.startsWith("https://modelcdn.tscircuit.com")

export const getModelFileName = (modelPath: string) => {
  // Strip URL suffixes and normalize local paths before taking the filename.
  const modelPathWithoutQuery = modelPath.split("?")[0] || modelPath
  const modelPathWithoutHash =
    modelPathWithoutQuery.split("#")[0] || modelPathWithoutQuery
  const normalizedModelPath = modelPathWithoutHash.replaceAll("\\", "/")

  return normalizedModelPath.split("/").pop() || modelPath
}

const normalizeModelSourceKey = (modelPath: string) => {
  const withoutQuery = modelPath.split("?")[0] || modelPath
  return withoutQuery.split("#")[0] || withoutQuery
}

export class Kicad3dModelFilenameResolver {
  private sourceToFilenameByDir = new Map<string, Map<string, string>>()
  private usedFilenamesByDir = new Map<string, Set<string>>()

  resolveFilename(
    shapesDir: string,
    sourcePath: string,
    rawFilename = getModelFileName(sourcePath),
  ): string {
    const normalizedSource = normalizeModelSourceKey(sourcePath)
    let sourceMap = this.sourceToFilenameByDir.get(shapesDir)
    if (!sourceMap) {
      sourceMap = new Map()
      this.sourceToFilenameByDir.set(shapesDir, sourceMap)
    }
    const existing = sourceMap.get(normalizedSource)
    if (existing) return existing

    let usedSet = this.usedFilenamesByDir.get(shapesDir)
    if (!usedSet) {
      usedSet = new Set()
      this.usedFilenamesByDir.set(shapesDir, usedSet)
    }

    let candidate = rawFilename
    if (usedSet.has(candidate)) {
      const dotIndex = rawFilename.lastIndexOf(".")
      const stem = dotIndex > 0 ? rawFilename.slice(0, dotIndex) : rawFilename
      const ext = dotIndex > 0 ? rawFilename.slice(dotIndex) : ""
      let suffix = 2
      while (usedSet.has(`${stem}_${suffix}${ext}`)) {
        suffix++
      }
      candidate = `${stem}_${suffix}${ext}`
    }

    usedSet.add(candidate)
    sourceMap.set(normalizedSource, candidate)
    return candidate
  }
}

export const resolveAndLoadKicad3dModelFiles = async ({
  model3dSourcePaths,
  projectName,
  fetch,
  readFile,
  onModelFile,
  onError,
}: ResolveAndLoadKicad3dModelFilesOptions) => {
  const filenameResolver = new Kicad3dModelFilenameResolver()

  for (const sourcePath of model3dSourcePaths) {
    // Builtin tscircuit models share one KiCad 3D model folder.
    let shapesDir = `${projectName}.3dshapes`
    if (isBuiltinModelPath(sourcePath)) {
      shapesDir = "tscircuit_builtin.3dshapes"
    }

    const filename = filenameResolver.resolveFilename(shapesDir, sourcePath)
    const outputPath = `3dmodels/${shapesDir}/${filename}`

    let content: Uint8Array
    try {
      if (isRemotePath(sourcePath)) {
        const response = await fetch(sourcePath)
        if (!response.ok) {
          throw new Error(`Failed to fetch 3D model from ${sourcePath}`)
        }

        content = new Uint8Array(await response.arrayBuffer())
      } else {
        if (!readFile) {
          throw new Error(
            `Cannot read local 3D model without readFile: ${sourcePath}`,
          )
        }

        const fileContent = await readFile(sourcePath)
        if (fileContent instanceof Uint8Array) {
          content = fileContent
        } else {
          content = new Uint8Array(fileContent)
        }
      }
    } catch (error) {
      if (!onError) {
        throw error
      }

      // Callers such as the CLI can skip failed model loads and keep exporting.
      await onError({ sourcePath, error })
      continue
    }

    await onModelFile({ sourcePath, outputPath, content })
  }
}
