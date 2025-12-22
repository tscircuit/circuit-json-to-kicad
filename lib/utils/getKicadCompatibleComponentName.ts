import type { SourceComponentBase, CadComponent } from "circuit-json"

/**
 * Generates an ergonomic component name for use in KiCad symbols and footprints.
 *
 * Priority:
 * 1. manufacturer_part_number (BEST) - e.g., "NA555", "ATmega328P"
 * 2. {clean_type}_{footprinter_string} (OK) - e.g., "resistor_0402", "chip_soic8"
 * 3. {clean_type} (LAST RESORT) - e.g., "resistor", "capacitor", "chip"
 *
 * Never uses:
 * - Reference designators (R1, U1, C1)
 * - "simple_" prefix
 * - source_component_id
 */
export function getKicadCompatibleComponentName(
  sourceComponent: SourceComponentBase,
  cadComponent?: CadComponent | null,
): string {
  // Priority 1: Use manufacturer part number if available
  if (sourceComponent.manufacturer_part_number) {
    return sanitizeName(sourceComponent.manufacturer_part_number)
  }

  // Get clean type name (strip "simple_" prefix)
  const cleanType = getCleanTypeName(sourceComponent.ftype)

  // Priority 2: Use type + footprinter string if available
  const footprinterString = cadComponent?.footprinter_string
  if (footprinterString) {
    return sanitizeName(`${cleanType}_${footprinterString}`)
  }

  // Priority 3: Use clean type name only
  return sanitizeName(cleanType)
}

/**
 * Clean up the ftype by removing "simple_" prefix
 */
function getCleanTypeName(ftype?: string): string {
  if (!ftype) return "component"

  // Remove "simple_" prefix
  let cleanName = ftype.replace(/^simple_/, "")

  // Handle empty result
  if (!cleanName) return "component"

  return cleanName
}

/**
 * Sanitize a name for use in KiCad
 * - Replace invalid characters with underscores
 * - Trim whitespace
 */
function sanitizeName(name: string): string {
  return (
    name
      .replace(/[\\\/:\s]+/g, "_") // Replace invalid chars with underscore
      .replace(/_+/g, "_") // Collapse multiple underscores
      .replace(/^_|_$/g, "") // Trim leading/trailing underscores
      .trim() || "component"
  )
}

/**
 * Extracts the reference prefix from a component's name (reference designator)
 * e.g., "R1" -> "R", "U23" -> "U", "C5" -> "C"
 */
export function extractReferencePrefix(name?: string): string {
  if (!name) return "U"
  // Extract leading letters from the reference designator
  const match = name.match(/^([A-Za-z]+)/)
  return match?.[1]?.toUpperCase() ?? "U"
}
