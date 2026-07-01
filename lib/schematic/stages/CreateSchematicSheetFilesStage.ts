import type { CircuitJson } from "circuit-json"
import type {
  KicadSchFile,
  KicadSchFileOutputOptions,
} from "../CircuitJsonToKicadSchConverter"
import { createRootSchematicString } from "../createRootSchematicString"
import { CircuitJsonToKicadSchConverter } from "../CircuitJsonToKicadSchConverter"
import {
  getCircuitJsonForSchematicSheet,
  getSchematicSheetFiles,
} from "../schematicSheetFiles"

export class CreateSchematicSheetFilesStage {
  constructor(
    private readonly circuitJson: CircuitJson,
    private readonly rootSchematicContent: string,
    private readonly options: KicadSchFileOutputOptions,
  ) {}

  getOutputFiles(): KicadSchFile[] {
    const schematicSheetFiles = getSchematicSheetFiles(this.circuitJson)
    if (schematicSheetFiles.length === 0) {
      return [
        {
          filename: this.options.schematicFilename,
          content: this.rootSchematicContent,
        },
      ]
    }

    return [
      {
        filename: this.options.schematicFilename,
        content: createRootSchematicString(schematicSheetFiles),
      },
      ...schematicSheetFiles.map((sheetFile, index) => {
        const sheetCircuitJson = getCircuitJsonForSchematicSheet(
          this.circuitJson,
          sheetFile.schematicSheetId,
        )
        const sheetConverter = new CircuitJsonToKicadSchConverter(
          sheetCircuitJson,
          {
            schematicUuid: sheetFile.kicadSheetUuid,
            sheetInstancePath: `/${sheetFile.kicadSheetUuid}`,
            symbolInstancePath: `/${sheetFile.kicadSheetUuid}`,
            schematicPageNumber: String(index + 2),
          },
        )
        sheetConverter.runUntilFinished()

        return {
          filename: sheetFile.filename,
          content: sheetConverter.getOutputString(),
        }
      }),
    ]
  }
}
