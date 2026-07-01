import type { CircuitJson } from "circuit-json"
import {
  At,
  EmbeddedFonts,
  KicadSch,
  Paper,
  Sheet,
  SheetInstancePage,
  SheetInstancePath,
  SheetInstances,
  SheetInstancesForSheet,
  SheetInstancesProject,
  SheetInstancesRootPage,
  SheetInstancesRootPath,
  SheetProperty,
  Stroke,
  TextEffects,
  TextEffectsFont,
  Uuid,
} from "kicadts"
import type {
  KicadSchFile,
  KicadSchFileOutputOptions,
} from "../CircuitJsonToKicadSchConverter"
import { CircuitJsonToKicadSchConverter } from "../CircuitJsonToKicadSchConverter"
import {
  getCircuitJsonForSchematicSheet,
  getSchematicSheetFiles,
  type SchematicSheetFile,
} from "../schematicSheetFiles"

const ROOT_SHEET_WIDTH_MM = 80
const ROOT_SHEET_HEIGHT_MM = 30
const ROOT_SHEET_X_MM = 35
const ROOT_SHEET_START_Y_MM = 35
const ROOT_SHEET_GAP_MM = 16

const createSheetTextEffects = () => {
  const font = new TextEffectsFont()
  font.size = { width: 1.27, height: 1.27 }
  return new TextEffects({ font })
}

const createRootSchematicString = (
  sheetFiles: SchematicSheetFile[],
): string => {
  const kicadSch = new KicadSch({
    generator: "circuit-json-to-kicad",
    generatorVersion: "0.0.1",
  })
  kicadSch.version = 20250114
  kicadSch.uuid = new Uuid(crypto.randomUUID())

  const paper = new Paper()
  paper.size = "A4"
  kicadSch.paper = paper

  const sheetInstances = new SheetInstances()
  const rootPath = new SheetInstancesRootPath()
  rootPath.value = "/"
  rootPath.pages = [new SheetInstancesRootPage("1")]
  sheetInstances.paths = [rootPath]
  kicadSch.sheetInstances = sheetInstances
  kicadSch.embeddedFonts = new EmbeddedFonts(false)

  const stroke = new Stroke()
  stroke.width = 0.1524
  stroke.type = "solid"

  kicadSch.sheets = sheetFiles.map((sheetFile, index) => {
    const x = ROOT_SHEET_X_MM
    const y =
      ROOT_SHEET_START_Y_MM + index * (ROOT_SHEET_HEIGHT_MM + ROOT_SHEET_GAP_MM)
    const instances = new SheetInstancesForSheet()
    const project = new SheetInstancesProject("")
    const path = new SheetInstancePath(`/${sheetFile.kicadSheetUuid}`)
    path.pages = [new SheetInstancePage(String(index + 2))]
    project.paths = [path]
    instances.projects = [project]

    return new Sheet({
      position: [x, y],
      size: { width: ROOT_SHEET_WIDTH_MM, height: ROOT_SHEET_HEIGHT_MM },
      excludeFromSim: false,
      inBom: false,
      onBoard: false,
      dnp: false,
      fieldsAutoplaced: true,
      stroke,
      uuid: sheetFile.kicadSheetUuid,
      properties: [
        new SheetProperty({
          key: "Sheetname",
          value: sheetFile.displayName,
          id: 0,
          at: At.from([x, y - 1.27, 0]),
          effects: createSheetTextEffects(),
        }),
        new SheetProperty({
          key: "Sheetfile",
          value: sheetFile.filename,
          id: 1,
          at: At.from([x, y + ROOT_SHEET_HEIGHT_MM + 1.27, 0]),
          effects: createSheetTextEffects(),
        }),
      ],
      instances,
    })
  })

  return kicadSch.getString()
}

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
            schematicInstancePath: `/${sheetFile.kicadSheetUuid}`,
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
