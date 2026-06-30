import type { CircuitJson } from "circuit-json"

export interface SchematicSheetFile {
  schematicSheetId: string
  displayName: string
  sheetIndex: number
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

const createDeterministicUuid = (value: string): string => {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0")
  return `${hex.slice(0, 8)}-${hex.slice(0, 4)}-4${hex.slice(5, 8)}-8${hex.slice(1, 4)}-${hex}${hex.slice(0, 4)}`
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
        sheet.display_name ?? sheet.displayName ?? sheet.name ?? `Sheet ${index + 1}`
      const filenameBase = toKicadSheetFilename(displayName)
      const duplicateCount = usedFilenames.get(filenameBase) ?? 0
      usedFilenames.set(filenameBase, duplicateCount + 1)

      return {
        schematicSheetId: sheet.schematic_sheet_id,
        displayName,
        sheetIndex: sheet.sheet_index ?? index,
        filename:
          duplicateCount === 0
            ? filenameBase
            : filenameBase.replace(
                /\.kicad_sch$/,
                `_${duplicateCount + 1}.kicad_sch`,
              ),
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

export const getSchematicFilenameBySourceComponentId = (
  circuitJson: CircuitJson,
): Map<string, string> => {
  const filenameBySheetId = new Map(
    getSchematicSheetFiles(circuitJson).map((sheet) => [
      sheet.schematicSheetId,
      sheet.filename,
    ]),
  )
  const filenameBySourceComponentId = new Map<string, string>()

  for (const element of circuitJson as any[]) {
    if (
      element.type !== "schematic_component" ||
      !element.source_component_id ||
      !element.schematic_sheet_id
    ) {
      continue
    }

    const filename = filenameBySheetId.get(element.schematic_sheet_id)
    if (filename) {
      filenameBySourceComponentId.set(element.source_component_id, filename)
    }
  }

  return filenameBySourceComponentId
}
