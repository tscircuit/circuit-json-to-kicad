import type { CircuitJson } from "circuit-json"

export interface SchematicSheetFile {
  schematicSheetId: string
  displayName: string
  filename: string
  kicadSheetUuid: string
}

const toKicadSheetFilename = (name: string): string => {
  const basename = name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")

  return `${basename || "sheet"}.kicad_sch`
}

const simpleHash = (value: string): string => {
  let hash = 0
  let result = ""
  for (let seed = 0; seed < 4; seed++) {
    hash = seed * 31
    for (let i = 0; i < value.length; i++) {
      hash = (hash << 5) - hash + value.charCodeAt(i) + seed
      hash |= 0
    }
    result += Math.abs(hash).toString(16).padStart(8, "0")
  }
  return result
}

const createDeterministicUuid = (value: string): string => {
  const hash = simpleHash(value)
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

export const getSchematicSheetFiles = (
  circuitJson: CircuitJson,
): SchematicSheetFile[] => {
  const usedFilenames = new Map<string, number>()

  return (circuitJson as any[])
    .filter((element) => element.type === "schematic_sheet")
    .sort((a, b) => {
      const aIndex = a.sheet_index ?? 0
      const bIndex = b.sheet_index ?? 0
      if (aIndex !== bIndex) return aIndex - bIndex
      return String(a.name ?? a.schematic_sheet_id).localeCompare(
        String(b.name ?? b.schematic_sheet_id),
      )
    })
    .map((sheet, index) => {
      const displayName =
        sheet.display_name ??
        sheet.displayName ??
        sheet.name ??
        `Sheet ${index + 1}`
      const filenameBase = toKicadSheetFilename(displayName)
      const duplicateCount = usedFilenames.get(filenameBase) ?? 0
      usedFilenames.set(filenameBase, duplicateCount + 1)
      let filename = filenameBase
      if (duplicateCount > 0) {
        filename = filenameBase.replace(
          /\.kicad_sch$/,
          `_${duplicateCount + 1}.kicad_sch`,
        )
      }

      return {
        schematicSheetId: sheet.schematic_sheet_id,
        displayName,
        filename,
        kicadSheetUuid: createDeterministicUuid(
          `schematic_sheet:${sheet.schematic_sheet_id}`,
        ),
      }
    })
}

export const getCircuitJsonForSchematicSheet = (
  circuitJson: CircuitJson,
  schematicSheetId: string,
): CircuitJson => {
  const componentIdsOnSheet = new Set<string>()

  for (const element of circuitJson as any[]) {
    if (
      element.type === "schematic_component" &&
      element.schematic_sheet_id === schematicSheetId &&
      element.schematic_component_id
    ) {
      componentIdsOnSheet.add(element.schematic_component_id)
    }
  }

  return (circuitJson as any[]).filter((element) => {
    if (element.type === "schematic_sheet") return false
    if (element.schematic_sheet_id === schematicSheetId) return true
    if (
      element.schematic_component_id &&
      componentIdsOnSheet.has(element.schematic_component_id)
    ) {
      return true
    }

    return !String(element.type).startsWith("schematic_")
  }) as CircuitJson
}
