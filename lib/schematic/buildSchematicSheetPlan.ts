import type { CircuitJson } from "circuit-json"

/** Fields common to the root page and every child schematic file. */
interface SchematicSheetPlanEntryBase {
  /** Value written to the KiCad `(property "Sheetname" ...)` */
  sheetName: string
  /** Sanitized, unique file stem (no extension) used to derive `filename` */
  fileBaseName: string
  /** File name for this sheet's `.kicad_sch` (root filename is overridden by the caller) */
  filename: string
  /** KiCad page number ("1" for root, "2".. for children) */
  pageNumber: string
  /** UUID written as this file's own top-level `(uuid ...)` */
  fileUuid: string
}

/** The top-level root schematic (page "1"); it holds the `(sheet)` nodes. */
export interface RootSchematicSheetPlanEntry
  extends SchematicSheetPlanEntryBase {
  schematicSheetId: null
}

/**
 * One circuit-json `schematic_sheet`, emitted as a `(sheet)` node on the root
 * page plus its own child `.kicad_sch` file.
 */
export interface ChildSchematicSheetPlanEntry
  extends SchematicSheetPlanEntryBase {
  /** circuit-json schematic_sheet_id this file represents */
  schematicSheetId: string
  /**
   * UUID of the `(sheet)` node placed on the root page. It is the second segment
   * of the symbol instance path for symbols on this sheet (`/<rootUuid>/<sheetNodeUuid>`).
   */
  sheetNodeUuid: string
}

export type SchematicSheetPlanEntry =
  | RootSchematicSheetPlanEntry
  | ChildSchematicSheetPlanEntry

/**
 * Blueprint of the KiCad schematic files to emit for one circuit-json input:
 * the root `.kicad_sch` plus one child `.kicad_sch` per `schematic_sheet`, each
 * with the UUIDs, filename, and page number KiCad needs. Computed up front (with
 * no file content) so the schematic converter and the `.kicad_pro` converter
 * agree on the same identifiers.
 */
export interface SchematicSheetPlan {
  /**
   * UUID of the root schematic file. Every symbol instance path begins with
   * this uuid (KiCad requirement), so it is shared by the root file, the child
   * files, the `(sheet)` nodes, and the `.kicad_pro` sheets list.
   */
  rootUuid: string
  root: RootSchematicSheetPlanEntry
  children: ChildSchematicSheetPlanEntry[]
  /** True when the design has `schematic_sheet`s and must be emitted as a hierarchy */
  isHierarchical: boolean
}

const DEFAULT_ROOT_FILENAME = "schematic.kicad_sch"

/** Turn an arbitrary sheet name into a filesystem/KiCad friendly file stem */
function toFileBaseName(sheetName: string, fallbackIndex: number): string {
  const baseName = sheetName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return baseName.length > 0 ? baseName : `sheet_${fallbackIndex + 1}`
}

/**
 * Builds the plan describing every KiCad schematic file that should be emitted
 * for a given circuit-json input.
 *
 * When there are no `schematic_sheet` elements the plan contains only the root
 * entry and `isHierarchical` is false, so the converter falls back to its
 * original single-file behavior.
 */
export function buildSchematicSheetPlan(
  circuitJson: CircuitJson,
): SchematicSheetPlan {
  const rootUuid = crypto.randomUUID()

  const root: RootSchematicSheetPlanEntry = {
    schematicSheetId: null,
    sheetName: "Root",
    fileBaseName: "root",
    filename: DEFAULT_ROOT_FILENAME,
    pageNumber: "1",
    fileUuid: rootUuid,
  }

  const schematicSheets = (circuitJson as any[])
    .filter((el) => el.type === "schematic_sheet")
    .slice()
    .sort((a, b) => (a.sheet_index ?? 0) - (b.sheet_index ?? 0))

  const usedFileBaseNames = new Set<string>(["root"])
  const children: ChildSchematicSheetPlanEntry[] = []
  for (let index = 0; index < schematicSheets.length; index++) {
    const sheet = schematicSheets[index]
    const sheetName: string =
      sheet.display_name ?? sheet.name ?? `Sheet ${index + 1}`

    let fileBaseName = toFileBaseName(sheet.name ?? sheetName, index)
    if (usedFileBaseNames.has(fileBaseName)) {
      let suffix = 2
      while (usedFileBaseNames.has(`${fileBaseName}_${suffix}`)) suffix++
      fileBaseName = `${fileBaseName}_${suffix}`
    }
    usedFileBaseNames.add(fileBaseName)

    children.push({
      schematicSheetId: sheet.schematic_sheet_id,
      sheetName,
      fileBaseName,
      filename: `${fileBaseName}.kicad_sch`,
      pageNumber: `${index + 2}`,
      sheetNodeUuid: crypto.randomUUID(),
      fileUuid: crypto.randomUUID(),
    })
  }

  return {
    rootUuid,
    root,
    children,
    isHierarchical: children.length > 0,
  }
}
