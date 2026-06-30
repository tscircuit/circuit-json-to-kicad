import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadSchConverter } from "../schematic/CircuitJsonToKicadSchConverter"

export interface ResolvedKicadSchematicFile {
  outputPath: string
  content: string
}

export interface ResolveKicadSchematicFilesOptions {
  circuitJson: CircuitJson
  schematicFilename: string
  onSchematicFile: (file: ResolvedKicadSchematicFile) => void | Promise<void>
}

export const resolveKicadSchematicFiles = async ({
  circuitJson,
  schematicFilename,
  onSchematicFile,
}: ResolveKicadSchematicFilesOptions) => {
  const schConverter = new CircuitJsonToKicadSchConverter(circuitJson)
  schConverter.runUntilFinished()

  for (const [outputPath, content] of Object.entries(
    schConverter.getOutputFiles(schematicFilename),
  )) {
    await onSchematicFile({ outputPath, content })
  }
}
