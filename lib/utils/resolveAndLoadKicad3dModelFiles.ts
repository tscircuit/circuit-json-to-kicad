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

const getModelFileName = (modelPath: string) => {
  // Strip URL suffixes and normalize local paths before taking the filename.
  const modelPathWithoutQuery = modelPath.split("?")[0] || modelPath
  const modelPathWithoutHash =
    modelPathWithoutQuery.split("#")[0] || modelPathWithoutQuery
  const normalizedModelPath = modelPathWithoutHash.replaceAll("\\", "/")

  return normalizedModelPath.split("/").pop() || modelPath
}

export const normalizeModel3dSourcePath = (modelPath: string) => {
  const withoutQuery = modelPath.split("?")[0] || modelPath
  return withoutQuery.split("#")[0] || withoutQuery
}

export const allocateDistinctModelFilename = ({
  sourcePath,
  shapesDir,
  sourcePathToFilename,
  usedFilenamesByDir,
}: {
  sourcePath: string
  shapesDir: string
  sourcePathToFilename: Map<string, string>
  usedFilenamesByDir: Map<string, Set<string>>
}): string => {
  const cleanSourcePath = normalizeModel3dSourcePath(sourcePath)
  const cacheKey = `${shapesDir}::${cleanSourcePath}`
  const existing = sourcePathToFilename.get(cacheKey)
  if (existing) return existing

  let usedInDir = usedFilenamesByDir.get(shapesDir)
  if (!usedInDir) {
    usedInDir = new Set<string>()
    usedFilenamesByDir.set(shapesDir, usedInDir)
  }

  const baseFilename = getModelFileName(cleanSourcePath)
  if (!usedInDir.has(baseFilename)) {
    usedInDir.add(baseFilename)
    sourcePathToFilename.set(cacheKey, baseFilename)
    return baseFilename
  }

  const dotIndex = baseFilename.lastIndexOf(".")
  const stem = dotIndex > 0 ? baseFilename.slice(0, dotIndex) : baseFilename
  const ext = dotIndex > 0 ? baseFilename.slice(dotIndex) : ""

  let suffix = 2
  let candidate = `${stem}_${suffix}${ext}`
  while (usedInDir.has(candidate)) {
    suffix++
    candidate = `${stem}_${suffix}${ext}`
  }

  usedInDir.add(candidate)
  sourcePathToFilename.set(cacheKey, candidate)
  return candidate
}

export const resolveAndLoadKicad3dModelFiles = async ({
  model3dSourcePaths,
  projectName,
  fetch,
  readFile,
  onModelFile,
  onError,
}: ResolveAndLoadKicad3dModelFilesOptions) => {
  const sourcePathToFilename = new Map<string, string>()
  const usedFilenamesByDir = new Map<string, Set<string>>()

  for (const sourcePath of model3dSourcePaths) {
    // Builtin tscircuit models share one KiCad 3D model folder.
    let shapesDir = `${projectName}.3dshapes`
    if (isBuiltinModelPath(sourcePath)) {
      shapesDir = "tscircuit_builtin.3dshapes"
    }

    const filename = allocateDistinctModelFilename({
      sourcePath,
      shapesDir,
      sourcePathToFilename,
      usedFilenamesByDir,
    })
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
