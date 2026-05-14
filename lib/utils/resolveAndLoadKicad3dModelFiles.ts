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
  const modelPathWithoutQuery = modelPath.split("?")[0] || modelPath
  const modelPathWithoutHash =
    modelPathWithoutQuery.split("#")[0] || modelPathWithoutQuery
  const normalizedModelPath = modelPathWithoutHash.replaceAll("\\", "/")

  return normalizedModelPath.split("/").pop() || modelPath
}

export const resolveAndLoadKicad3dModelFiles = async ({
  model3dSourcePaths,
  projectName,
  fetch,
  readFile,
  onModelFile,
  onError,
}: ResolveAndLoadKicad3dModelFilesOptions) => {
  for (const sourcePath of model3dSourcePaths) {
    let shapesDir = `${projectName}.3dshapes`
    if (isBuiltinModelPath(sourcePath)) {
      shapesDir = "tscircuit_builtin.3dshapes"
    }

    const outputPath = `3dmodels/${shapesDir}/${getModelFileName(sourcePath)}`

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

      await onError({ sourcePath, error })
      continue
    }

    await onModelFile({ sourcePath, outputPath, content })
  }
}
