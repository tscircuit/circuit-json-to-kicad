import type { AnyCircuitElement, CircuitJson } from "circuit-json"

function isSchematicElement(el: AnyCircuitElement): boolean {
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

  // A schematic_symbol is a shared definition rather than a placed page
  // element, so it must be available in every file that may reference it.
  if (el.type === "schematic_symbol") return true

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
 *  - shared `schematic_symbol` definitions in every file that may reference
 *    them.
 *
 * Unassigned placed elements are root-page content. They are not shared with
 * every child sheet merely because they lack a `schematic_sheet_id`.
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
