import { cju } from "@tscircuit/circuit-json-util"
import type { CircuitJson } from "circuit-json"
import { KicadSch, type Sheet } from "kicadts"
import { compose, scale, translate } from "transformation-matrix"
import type { ConverterContext, ConverterStage } from "../types"
import { buildChildSheetNodes } from "./buildChildSheetNodes"
import { getSchematicBoundsAndCenter } from "./getSchematicBoundsAndCenter"
import { partitionCircuitJsonBySheet } from "./partitionCircuitJsonBySheet"
import {
  buildSchematicSheetPlan,
  type SchematicSheetPlan,
  type SchematicSheetPlanEntry,
} from "./buildSchematicSheetPlan"
import { selectSchematicPaperSize } from "./selectSchematicPaperSize"
import { AddLibrarySymbolsStage } from "./stages/AddLibrarySymbolsStage"
import { AddSchematicGraphicsStage } from "./stages/AddSchematicGraphicsStage"
import { AddSchematicNetLabelsStage } from "./stages/AddSchematicNetLabelsStage"
import { AddSchematicSymbolsStage } from "./stages/AddSchematicSymbolsStage"
import { AddSchematicTracesStage } from "./stages/AddSchematicTracesStage"
import { AddSheetInstancesStage } from "./stages/AddSheetInstancesStage"
import { InitializeSchematicStage } from "./stages/InitializeSchematicStage"

const DEFAULT_SCHEMATIC_SCALE_FACTOR = 15
const DEFAULT_PAPER_PADDING_MM = 20

export interface KicadSchFile {
  filename: string
  content: string
}

export interface KicadSchFileOutputOptions {
  schematicFilename: string
}

interface BuiltSheetFile {
  entry: SchematicSheetPlanEntry
  kicadSch: KicadSch
  content: string
}

interface BuildSheetFileOptions {
  circuitJson: CircuitJson
  fileUuid: string
  /** Prefix for every symbol instance path in this file (e.g. `/<rootUuid>`) */
  symbolInstancePathPrefix: string
  /** Root/legacy files emit `sheet_instances` + `embedded_fonts`; children do not */
  emitSheetInstances: boolean
  /** `(sheet)` nodes to place on the page (root file only) */
  childSheetNodes?: Sheet[]
  /** Extra paper extent (mm) that must fit, e.g. the sheet-node grid */
  extraPaperExtentMm?: { width: number; height: number }
}

export class CircuitJsonToKicadSchConverter {
  ctx: ConverterContext

  pipeline: ConverterStage<CircuitJson, KicadSch>[]
  currentStageIndex = 0

  finished = false

  circuitJson: CircuitJson
  schematicSheetPlan: SchematicSheetPlan
  private files: BuiltSheetFile[] = []
  private built = false

  get currentStage() {
    return this.pipeline[this.currentStageIndex]
  }

  constructor(circuitJson: CircuitJson) {
    this.circuitJson = circuitJson
    this.schematicSheetPlan = buildSchematicSheetPlan(circuitJson)

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
    // A hierarchical design is emitted as several files, which don't fit the
    // single-pipeline stepping model; build them all in one shot.
    if (this.schematicSheetPlan.isHierarchical) {
      this.buildAll()
      this.finished = true
      return
    }

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
    if (this.schematicSheetPlan.isHierarchical) {
      this.buildAll()
      return this.files[0]!.kicadSch
    }
    return this.ctx.kicadSch!
  }

  /**
   * Get the (root) schematic as a string.
   */
  getOutputString(): string {
    if (this.schematicSheetPlan.isHierarchical) {
      this.buildAll()
      return this.files[0]!.content
    }
    return this.ctx.kicadSch!.getString()
  }

  /**
   * Returns every KiCad schematic file produced by this converter.
   *
   * For a design with no `schematic_sheet` elements this is a single root file.
   * For a hierarchical design it is the root file (named by
   * `options.schematicFilename`) followed by one child `.kicad_sch` per sheet,
   * each named after its sheet and referenced by the root via `Sheetfile`.
   */
  getOutputFiles(options: KicadSchFileOutputOptions): KicadSchFile[] {
    if (!this.schematicSheetPlan.isHierarchical) {
      return [
        {
          filename: options.schematicFilename,
          content: this.getOutputString(),
        },
      ]
    }

    this.buildAll()
    return this.files.map((file, index) => ({
      filename: index === 0 ? options.schematicFilename : file.entry.filename,
      content: file.content,
    }))
  }

  /** Builds the root + child `.kicad_sch` files for a hierarchical design. */
  private buildAll() {
    if (this.built) return
    this.built = true

    const { rootUuid, root, children } = this.schematicSheetPlan

    // Root file: the `(sheet)` nodes + any content not assigned to a sheet.
    const { nodes: childSheetNodes, extentMm } = buildChildSheetNodes(
      children,
      rootUuid,
    )
    const rootSch = this.buildSheetFile({
      circuitJson: partitionCircuitJsonBySheet(this.circuitJson, null),
      fileUuid: rootUuid,
      symbolInstancePathPrefix: `/${rootUuid}`,
      emitSheetInstances: true,
      childSheetNodes,
      extraPaperExtentMm: extentMm,
    })
    this.files.push({
      entry: root,
      kicadSch: rootSch,
      content: rootSch.getString(),
    })

    // One child `.kicad_sch` per schematic sheet.
    for (const child of children) {
      const childSch = this.buildSheetFile({
        circuitJson: partitionCircuitJsonBySheet(
          this.circuitJson,
          child.schematicSheetId,
        ),
        fileUuid: child.fileUuid,
        symbolInstancePathPrefix: `/${rootUuid}/${child.sheetNodeUuid}`,
        emitSheetInstances: false,
      })
      this.files.push({
        entry: child,
        kicadSch: childSch,
        content: childSch.getString(),
      })
    }
  }

  /** Builds one child/root `.kicad_sch` for a sheet, run to completion. */
  private buildSheetFile(options: BuildSheetFileOptions): KicadSch {
    const {
      circuitJson,
      fileUuid,
      symbolInstancePathPrefix,
      emitSheetInstances,
      childSheetNodes,
      extraPaperExtentMm,
    } = options

    const kicadSchematicScaleFactor = DEFAULT_SCHEMATIC_SCALE_FACTOR
    const db = cju(circuitJson)
    const { center, bounds } = getSchematicBoundsAndCenter(db)

    // Paper must fit the page content and (for the root file) the sheet-node grid.
    const paperSize = selectSchematicPaperSize(
      Math.max(
        (bounds.maxX - bounds.minX) * kicadSchematicScaleFactor +
          2 * DEFAULT_PAPER_PADDING_MM,
        extraPaperExtentMm?.width ?? 0,
      ),
      Math.max(
        (bounds.maxY - bounds.minY) * kicadSchematicScaleFactor +
          2 * DEFAULT_PAPER_PADDING_MM,
        extraPaperExtentMm?.height ?? 0,
      ),
      0,
    )

    const ctx: ConverterContext = {
      db,
      circuitJson,
      kicadSch: new KicadSch({
        generator: "circuit-json-to-kicad",
        generatorVersion: "0.0.1",
      }),
      kicadSchematicScaleFactor,
      schematicPaperSize: paperSize,
      c2kMatSch: compose(
        translate(paperSize.width / 2, paperSize.height / 2),
        scale(kicadSchematicScaleFactor, -kicadSchematicScaleFactor),
        translate(-center.x, -center.y),
      ),
      schematicFileUuid: fileUuid,
      symbolInstancePathPrefix,
    }

    // Run the same stages as the single-file pipeline, but against this file's
    // own context and to completion (each sheet file is a standalone .kicad_sch).
    const stages: ConverterStage<CircuitJson, KicadSch>[] = [
      new InitializeSchematicStage(circuitJson, ctx),
      new AddLibrarySymbolsStage(circuitJson, ctx),
      new AddSchematicSymbolsStage(circuitJson, ctx),
      new AddSchematicNetLabelsStage(circuitJson, ctx),
      new AddSchematicTracesStage(circuitJson, ctx),
      new AddSchematicGraphicsStage(circuitJson, ctx),
    ]
    if (emitSheetInstances) {
      stages.push(new AddSheetInstancesStage(circuitJson, ctx))
    }
    for (const stage of stages) stage.runUntilFinished()

    const kicadSch = ctx.kicadSch!

    // Sheet nodes are cross-file structural links attached to the root page.
    if (childSheetNodes && childSheetNodes.length > 0) {
      kicadSch.sheets = childSheetNodes
    }

    return kicadSch
  }
}
