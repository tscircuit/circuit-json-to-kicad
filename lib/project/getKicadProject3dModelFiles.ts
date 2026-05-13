export interface KicadProject3dModelFile {
  sourcePath: string
  projectPath: string
}

export interface GetKicadProject3dModelFilesOptions {
  projectName: string
  model3dSourcePaths: string[]
}

const isBuiltinModelPath = (modelPath: string) =>
  modelPath.startsWith("http://modelcdn.tscircuit.com") ||
  modelPath.startsWith("https://modelcdn.tscircuit.com")

export const getKicadProject3dModelFiles = ({
  projectName,
  model3dSourcePaths,
}: GetKicadProject3dModelFilesOptions): KicadProject3dModelFile[] => {
  const files: KicadProject3dModelFile[] = []
  for (const modelPath of model3dSourcePaths) {
    // Builtin tscircuit models share one KiCad 3D model folder.
    let shapesDir = `${projectName}.3dshapes`
    if (isBuiltinModelPath(modelPath)) {
      shapesDir = "tscircuit_builtin.3dshapes"
    }

    const fileName = modelPath.split("/").pop() || modelPath
    files.push({
      sourcePath: modelPath,
      // Callers can fetch sourcePath and write it to this project path.
      projectPath: `3dmodels/${shapesDir}/${fileName}`,
    })
  }

  return files
}
