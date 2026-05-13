import type { CircuitJson } from "circuit-json"
import JSZip from "jszip"
import { readFile } from "node:fs/promises"
import { CircuitJsonToKicadPcbConverter } from "../pcb/CircuitJsonToKicadPcbConverter"
import { CircuitJsonToKicadSchConverter } from "../schematic/CircuitJsonToKicadSchConverter"
import { CircuitJsonToKicadProConverter } from "./CircuitJsonToKicadProConverter"

type ModelFileContent = ArrayBuffer | Uint8Array

export interface ConvertCircuitJsonToKicadProjectZipOptions {
  projectName: string
  fetchModel?: (modelPath: string) => Promise<ModelFileContent>
}

const getModelFileName = (modelPath: string) => {
  const pathWithoutQuery = modelPath.split("?")[0] ?? modelPath
  const parts = pathWithoutQuery.split(/[/\\]/)
  return parts[parts.length - 1] || pathWithoutQuery
}

const isRemotePath = (modelPath: string) =>
  modelPath.startsWith("http://") || modelPath.startsWith("https://")

const isBuiltinModelPath = (modelPath: string) =>
  modelPath.startsWith("http://modelcdn.tscircuit.com") ||
  modelPath.startsWith("https://modelcdn.tscircuit.com")

const fetchModelFile = async (modelPath: string): Promise<ModelFileContent> => {
  if (!isRemotePath(modelPath)) {
    return readFile(modelPath)
  }

  const response = await fetch(modelPath)
  if (!response.ok) {
    throw new Error(`Failed to fetch 3D model from ${modelPath}`)
  }

  return response.arrayBuffer()
}

export const convertCircuitJsonToKicadProjectZip = async (
  circuitJson: CircuitJson,
  options: ConvertCircuitJsonToKicadProjectZipOptions,
) => {
  let projectName = options.projectName.trim()
  if (projectName.length === 0) {
    projectName = "project"
  }
  const schematicFileName = `${projectName}.kicad_sch`
  const boardFileName = `${projectName}.kicad_pcb`
  const projectFileName = `${projectName}.kicad_pro`

  const schConverter = new CircuitJsonToKicadSchConverter(circuitJson)
  schConverter.runUntilFinished()

  const pcbConverter = new CircuitJsonToKicadPcbConverter(circuitJson, {
    includeBuiltin3dModels: true,
    projectName,
  })
  pcbConverter.runUntilFinished()

  const proConverter = new CircuitJsonToKicadProConverter(circuitJson, {
    projectName,
    schematicFilename: schematicFileName,
    pcbFilename: boardFileName,
  })
  proConverter.runUntilFinished()

  const zip = new JSZip()
  zip.file(schematicFileName, schConverter.getOutputString())
  zip.file(boardFileName, pcbConverter.getOutputString())
  zip.file(projectFileName, proConverter.getOutputString())

  const loadModel = options.fetchModel ?? fetchModelFile
  for (const modelPath of pcbConverter.getModel3dSourcePaths()) {
    const fileName = getModelFileName(modelPath)
    let shapesDir = `${projectName}.3dshapes`
    if (isBuiltinModelPath(modelPath)) {
      shapesDir = "tscircuit_builtin.3dshapes"
    }
    const zipPath = `3dmodels/${shapesDir}/${fileName}`

    zip.file(zipPath, await loadModel(modelPath))
  }

  return zip
}
