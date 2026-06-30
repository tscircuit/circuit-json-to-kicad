import { cju } from "@tscircuit/circuit-json-util"
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
import { compose, scale, translate } from "transformation-matrix"
import type { ConverterContext, ConverterStage } from "../types"
import { getSchematicBoundsAndCenter } from "./getSchematicBoundsAndCenter"
import { selectSchematicPaperSize } from "./selectSchematicPaperSize"
import { AddLibrarySymbolsStage } from "./stages/AddLibrarySymbolsStage"
import { AddSchematicGraphicsStage } from "./stages/AddSchematicGraphicsStage"
import { AddSchematicNetLabelsStage } from "./stages/AddSchematicNetLabelsStage"
import { AddSchematicSymbolsStage } from "./stages/AddSchematicSymbolsStage"
import { AddSchematicTracesStage } from "./stages/AddSchematicTracesStage"
import { AddSheetInstancesStage } from "./stages/AddSheetInstancesStage"
import { InitializeSchematicStage } from "./stages/InitializeSchematicStage"
import {
  getCircuitJsonForSchematicSheet,
  getSchematicSheetFiles,
} from "./schematicSheetFiles"

const DEFAULT_SCHEMATIC_SCALE_FACTOR = 15
const ROOT_SHEET_WIDTH_MM = 80
const ROOT_SHEET_HEIGHT_MM = 30
const ROOT_SHEET_X_MM = 35
const ROOT_SHEET_START_Y_MM = 35
const ROOT_SHEET_GAP_MM = 16

interface CircuitJsonToKicadSchConverterOptions {
  schematicUuid?: string
  schematicInstancePath?: string
  schematicPageNumber?: string
}

export class CircuitJsonToKicadSchConverter {
  ctx: ConverterContext
  circuitJson: CircuitJson

  pipeline: ConverterStage<CircuitJson, KicadSch>[]
  currentStageIndex = 0

  finished = false

  get currentStage() {
    return this.pipeline[this.currentStageIndex]
  }

  constructor(
    circuitJson: CircuitJson,
    options: CircuitJsonToKicadSchConverterOptions = {},
  ) {
    this.circuitJson = circuitJson
    const kicadSchematicScaleFactor = DEFAULT_SCHEMATIC_SCALE_FACTOR

    const db = cju(circuitJson)

    const { center, bounds } = getSchematicBoundsAndCenter(db)

    // Calculate the size of the schematic in KiCad coordinates (mm)
    const schematicWidthMm =
      (bounds.maxX - bounds.minX) * kicadSchematicScaleFactor
    const schematicHeightMm =
      (bounds.maxY - bounds.minY) * kicadSchematicScaleFactor

    // Select appropriate paper size based on content
    const paperSize = selectSchematicPaperSize(
      schematicWidthMm,
      schematicHeightMm,
    )

    // Use the center of the selected paper size
    const KICAD_CENTER_X = paperSize.width / 2
    const KICAD_CENTER_Y = paperSize.height / 2

    this.ctx = {
      db,
      circuitJson,
      kicadSch: new KicadSch({
        generator: "circuit-json-to-kicad",
        generatorVersion: "0.0.1",
      }),
      kicadSchematicScaleFactor,
      schematicPaperSize: paperSize,
      schematicUuid: options.schematicUuid,
      schematicInstancePath: options.schematicInstancePath,
      schematicPageNumber: options.schematicPageNumber,
      c2kMatSch: compose(
        translate(KICAD_CENTER_X, KICAD_CENTER_Y),
        scale(kicadSchematicScaleFactor, -kicadSchematicScaleFactor),
        translate(-center.x, -center.y),
      ),
    }
    this.pipeline = [
      new InitializeSchematicStage(circuitJson, this.ctx),
      new AddLibrarySymbolsStage(circuitJson, this.ctx),
      new AddSchematicSymbolsStage(circuitJson, this.ctx),
      new AddSchematicNetLabelsStage(circuitJson, this.ctx),
      new AddSchematicTracesStage(circuitJson, this.ctx),
      new AddSchematicGraphicsStage(circuitJson, this.ctx),
      new AddSheetInstancesStage(circuitJson, this.ctx),
    ]
  }

  step() {
    if (!this.currentStage) {
      this.finished = true
      return
    }
    this.currentStage.step()
    if (this.currentStage.finished) {
      this.currentStageIndex++
    }
  }

  runUntilFinished() {
    while (!this.finished) {
      this.step()
    }
  }

  getOutput(): KicadSch {
    return this.ctx.kicadSch!
  }

  /**
   * Get the output as a string
   */
  getOutputString(): string {
    return this.ctx.kicadSch!.getString()
  }

  getOutputFiles(rootFilename: string): Record<string, string> {
    const schematicSheetFiles = getSchematicSheetFiles(this.circuitJson)
    if (schematicSheetFiles.length === 0) {
      return { [rootFilename]: this.getOutputString() }
    }

    const outputFiles: Record<string, string> = {
      [rootFilename]: createRootSchematicString(schematicSheetFiles),
    }

    for (const [index, sheetFile] of schematicSheetFiles.entries()) {
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
      outputFiles[sheetFile.filename] = sheetConverter.getOutputString()
    }

    return outputFiles
  }
}

const createSheetTextEffects = () => {
  const font = new TextEffectsFont()
  font.size = { width: 1.27, height: 1.27 }
  return new TextEffects({ font })
}

const createRootSchematicString = (
  sheetFiles: ReturnType<typeof getSchematicSheetFiles>,
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
    const y = ROOT_SHEET_START_Y_MM + index * (ROOT_SHEET_HEIGHT_MM + ROOT_SHEET_GAP_MM)
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
