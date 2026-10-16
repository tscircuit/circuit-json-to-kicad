import { resolveKicad3dModelPaths } from "./resolveKicad3dModelPaths"

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

export const resolveAndLoadKicad3dModelFiles = async ({
  model3dSourcePaths,
  projectName,
  fetch,
  readFile,
  onModelFile,
  onError,
}: ResolveAndLoadKicad3dModelFilesOptions) => {
  const outputPaths = resolveKicad3dModelPaths(model3dSourcePaths, projectName)
  for (const sourcePath of new Set(model3dSourcePaths)) {
    const outputPath = outputPaths.get(sourcePath)!

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
