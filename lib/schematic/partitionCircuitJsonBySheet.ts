import type { CircuitJson } from "circuit-json"

function isSchematicElement(el: any): boolean {
  return typeof el.type === "string" && el.type.startsWith("schematic_")
}

/** Whether a single element belongs in the subset for `sheetId`. */
function keepElementForSheet(
  el: any,
  sheetId: string | null,
  componentIdsOnSheet: Set<string>,
): boolean {
  if (!isSchematicElement(el)) return true

  // schematic_sheet rows become (sheet) nodes, never page content.
  if (el.type === "schematic_sheet") return false

  const hasSheetIdField = "schematic_sheet_id" in el
  const hasComponentIdField = "schematic_component_id" in el

  // Shared definitions referenced by id (e.g. schematic_symbol) belong in every
  // file so custom symbols resolve on whichever sheet uses them.
  if (!hasSheetIdField && !hasComponentIdField) return true

  if ((el.schematic_sheet_id ?? null) === sheetId) return true

  return (
    el.schematic_component_id != null &&
    componentIdsOnSheet.has(el.schematic_component_id)
  )
}

/**
 * Returns the subset of a circuit-json describing a single schematic sheet.
 *
 * Passing `sheetId = null` selects the "root" content: every schematic element
 * not assigned to any `schematic_sheet` (i.e. laid out directly on the top-level
 * page).
 *
 * The subset keeps:
 *  - every non-`schematic_*` element (source_*, cad_component, pcb_*, simulation_*,
 *    project metadata, ...) so metadata lookups keep working in every file,
 *  - `schematic_*` elements whose `schematic_sheet_id` matches `sheetId`,
 *  - `schematic_*` elements linked (via `schematic_component_id`) to a component
 *    that lives on this sheet, even if the element's own `schematic_sheet_id` is
 *    unset (robustly keeps ports/texts with their component),
 *  - shared schematic definitions that are referenced by id rather than placed
 *    on a page (e.g. `schematic_symbol` custom-symbol geometry).
 *
 * The `schematic_sheet` rows themselves are dropped from the subset because they
 * are represented in KiCad as `(sheet ...)` nodes on the root page, not as page
 * content.
 */
export function partitionCircuitJsonBySheet(
  circuitJson: CircuitJson,
  sheetId: string | null,
): CircuitJson {
  const elements = circuitJson as any[]

  // Component ids that live on the target sheet (root = no sheet id).
  const componentIdsOnSheet = new Set<string>()
  for (const el of elements) {
    if (el.type !== "schematic_component") continue
    if ((el.schematic_sheet_id ?? null) === sheetId) {
      componentIdsOnSheet.add(el.schematic_component_id)
    }
  }

  const subset: any[] = []
  for (const el of elements) {
    if (keepElementForSheet(el, sheetId, componentIdsOnSheet)) {
      subset.push(el)
    }
  }
  return subset as CircuitJson
}
