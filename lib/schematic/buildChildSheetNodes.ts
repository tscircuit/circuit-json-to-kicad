import {
  At,
  Color,
  Sheet,
  SheetFill,
  SheetInstancePage,
  SheetInstancePath,
  SheetInstancesForSheet,
  SheetInstancesProject,
  SheetProperty,
  SheetSize,
  Stroke,
  TextEffects,
  TextEffectsFont,
  TextEffectsJustify,
} from "kicadts"
import type { ChildSchematicSheetPlanEntry } from "./buildSchematicSheetPlan"

// Sheet box + grid layout constants (millimeters)
const BOX_WIDTH = 40
const BOX_HEIGHT = 25
const GUTTER_X = 20
const GUTTER_Y = 30
const MARGIN = 25.4
const PROPERTY_FONT_SIZE = 1.524
const SHEET_BORDER_WIDTH = 0.1524

function createSheetPropertyEffects(vertical: "top" | "bottom"): TextEffects {
  const font = new TextEffectsFont()
  font.size = { height: PROPERTY_FONT_SIZE, width: PROPERTY_FONT_SIZE }
  return new TextEffects({
    font,
    justify: new TextEffectsJustify({ horizontal: "left", vertical }),
  })
}

function buildSheetNode(
  entry: ChildSchematicSheetPlanEntry,
  rootUuid: string,
  x: number,
  y: number,
): Sheet {
  const stroke = new Stroke()
  stroke.width = SHEET_BORDER_WIDTH
  stroke.type = "solid"

  const fill = new SheetFill()
  fill.color = new Color([0, 0, 0, 0])

  const sheetnameProperty = new SheetProperty({
    key: "Sheetname",
    value: entry.sheetName,
    id: 0,
    at: At.from([x, y - 0.7, 0]),
    effects: createSheetPropertyEffects("bottom"),
  })

  const sheetfileProperty = new SheetProperty({
    key: "Sheetfile",
    value: entry.filename,
    id: 1,
    at: At.from([x, y + BOX_HEIGHT + 0.7, 0]),
    effects: createSheetPropertyEffects("top"),
  })

  // (instances (project "" (path "/<rootUuid>" (page "<n>"))))
  const instancePath = new SheetInstancePath(`/${rootUuid}`)
  instancePath.pages = [new SheetInstancePage(entry.pageNumber)]
  const instancesProject = new SheetInstancesProject("")
  instancesProject.paths = [instancePath]
  // SheetInstancesForSheet renders as `(instances ...)` (parent token `sheet`),
  // whereas SheetInstances renders as the top-level `(sheet_instances ...)`.
  const instances = new SheetInstancesForSheet()
  instances.projects = [instancesProject]

  return new Sheet({
    position: [x, y],
    size: new SheetSize(BOX_WIDTH, BOX_HEIGHT),
    excludeFromSim: false,
    inBom: true,
    onBoard: true,
    dnp: false,
    fieldsAutoplaced: true,
    stroke,
    fill,
    uuid: entry.sheetNodeUuid,
    properties: [sheetnameProperty, sheetfileProperty],
    // No pins: cross-sheet connectivity is carried by global labels.
    instances,
  })
}

/**
 * Builds the `(sheet ...)` nodes placed on the root schematic page, laid out in
 * a simple grid, and reports the paper extent (mm) required to contain them.
 */
export function buildChildSheetNodes(
  children: ChildSchematicSheetPlanEntry[],
  rootUuid: string,
): { nodes: Sheet[]; extentMm: { width: number; height: number } } {
  const count = children.length
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)))
  const rows = Math.max(1, Math.ceil(count / cols))

  const nodes: Sheet[] = []
  for (let index = 0; index < children.length; index++) {
    const col = index % cols
    const row = Math.floor(index / cols)
    const x = MARGIN + col * (BOX_WIDTH + GUTTER_X)
    const y = MARGIN + row * (BOX_HEIGHT + GUTTER_Y)
    nodes.push(buildSheetNode(children[index]!, rootUuid, x, y))
  }

  const spanW = cols * BOX_WIDTH + (cols - 1) * GUTTER_X
  const spanH = rows * BOX_HEIGHT + (rows - 1) * GUTTER_Y

  return {
    nodes,
    extentMm: {
      width: 2 * MARGIN + spanW,
      height: 2 * MARGIN + spanH,
    },
  }
}
