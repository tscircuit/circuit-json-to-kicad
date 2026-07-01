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
import type { SchematicSheetFile } from "./schematicSheetFiles"

const KICAD_SCHEMATIC_VERSION = 20250114
const KICAD_GENERATOR = "circuit-json-to-kicad"
const KICAD_GENERATOR_VERSION = "0.0.1"
const ROOT_SHEET_PAPER_SIZE = "A4"
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

export const createRootSchematicString = (
  sheetFiles: SchematicSheetFile[],
): string => {
  const kicadSch = new KicadSch({
    generator: KICAD_GENERATOR,
    generatorVersion: KICAD_GENERATOR_VERSION,
  })
  kicadSch.version = KICAD_SCHEMATIC_VERSION
  kicadSch.uuid = new Uuid(crypto.randomUUID())

  const paper = new Paper()
  paper.size = ROOT_SHEET_PAPER_SIZE
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
