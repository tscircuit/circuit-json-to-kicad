import { cju } from "@tscircuit/circuit-json-util"
import type { CircuitJson } from "circuit-json"
import { KicadSch, type Sheet } from "kicadts"
import { compose, scale, translate } from "transformation-matrix"
import type { ConverterContext } from "../types"
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
  circuitJson: CircuitJson
  schematicSheetPlan: SchematicSheetPlan

  finished = false

  private files: BuiltSheetFile[] = []
  private built = false

  constructor(circuitJson: CircuitJson) {
    this.circuitJson = circuitJson
    this.schematicSheetPlan = buildSchematicSheetPlan(circuitJson)
  }

  /** Builds a single `.kicad_sch` file (root, child, or legacy single-file). */
  private buildSheetFile(options: BuildSheetFileOptions): {
    kicadSch: KicadSch
    content: string
  } {
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

    const contentWidthMm =
      (bounds.maxX - bounds.minX) * kicadSchematicScaleFactor
    const contentHeightMm =
      (bounds.maxY - bounds.minY) * kicadSchematicScaleFactor

    // Choose a paper big enough for both the page content and (for the root
    // file) the sheet-node grid.
    const requiredWidthMm = Math.max(
      contentWidthMm + 2 * DEFAULT_PAPER_PADDING_MM,
      extraPaperExtentMm?.width ?? 0,
    )
    const requiredHeightMm = Math.max(
      contentHeightMm + 2 * DEFAULT_PAPER_PADDING_MM,
      extraPaperExtentMm?.height ?? 0,
    )
    const paperSize = selectSchematicPaperSize(
      requiredWidthMm,
      requiredHeightMm,
      0,
    )

    const KICAD_CENTER_X = paperSize.width / 2
    const KICAD_CENTER_Y = paperSize.height / 2

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
        translate(KICAD_CENTER_X, KICAD_CENTER_Y),
        scale(kicadSchematicScaleFactor, -kicadSchematicScaleFactor),
        translate(-center.x, -center.y),
      ),
      schematicFileUuid: fileUuid,
      symbolInstancePathPrefix,
    }

    const pipeline = [
      new InitializeSchematicStage(circuitJson, ctx),
      new AddLibrarySymbolsStage(circuitJson, ctx),
      new AddSchematicSymbolsStage(circuitJson, ctx),
      new AddSchematicNetLabelsStage(circuitJson, ctx),
      new AddSchematicTracesStage(circuitJson, ctx),
      new AddSchematicGraphicsStage(circuitJson, ctx),
      ...(emitSheetInstances
        ? [new AddSheetInstancesStage(circuitJson, ctx)]
        : []),
    ]

    for (const stage of pipeline) stage.runUntilFinished()

    const kicadSch = ctx.kicadSch!

    // Sheet nodes are cross-file structural links for the root page, not content
    // converted from this file's circuit-json, so they are attached here rather
    // than in a pipeline stage.
    if (childSheetNodes && childSheetNodes.length > 0) {
      kicadSch.sheets = childSheetNodes
    }

    return { kicadSch, content: kicadSch.getString() }
  }

  private buildAll() {
    if (this.built) return

    const { rootUuid, root, children, isHierarchical } = this.schematicSheetPlan

    if (!isHierarchical) {
      // Legacy single-file output: identical behavior to before sheets existed.
      const built = this.buildSheetFile({
        circuitJson: this.circuitJson,
        fileUuid: rootUuid,
        symbolInstancePathPrefix: `/${rootUuid}`,
        emitSheetInstances: true,
      })
      this.files.push({
        entry: root,
        kicadSch: built.kicadSch,
        content: built.content,
      })
      this.built = true
      return
    }

    // Root file: sheet nodes + any content not assigned to a sheet.
    const { nodes: childSheetNodes, extentMm } = buildChildSheetNodes(
      children,
      rootUuid,
    )
    const rootBuilt = this.buildSheetFile({
      circuitJson: partitionCircuitJsonBySheet(this.circuitJson, null),
      fileUuid: rootUuid,
      symbolInstancePathPrefix: `/${rootUuid}`,
      emitSheetInstances: true,
      childSheetNodes,
      extraPaperExtentMm: extentMm,
    })
    this.files.push({
      entry: root,
      kicadSch: rootBuilt.kicadSch,
      content: rootBuilt.content,
    })

    // One child `.kicad_sch` per schematic sheet.
    for (const child of children) {
      const built = this.buildSheetFile({
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
        kicadSch: built.kicadSch,
        content: built.content,
      })
    }

    this.built = true
  }

  runUntilFinished() {
    this.buildAll()
    this.finished = true
  }

  getOutput(): KicadSch {
    this.buildAll()
    return this.files[0]!.kicadSch
  }

  /**
   * Get the root schematic file as a string.
   */
  getOutputString(): string {
    this.buildAll()
    return this.files[0]!.content
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
    this.buildAll()
    return this.files.map((file, index) => ({
      filename: index === 0 ? options.schematicFilename : file.entry.filename,
      content: file.content,
    }))
  }
}
