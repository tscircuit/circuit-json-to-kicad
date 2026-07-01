import type { AnyCircuitElement, CircuitJson } from "circuit-json"

type SchematicSheetElement = AnyCircuitElement & {
  type: "schematic_sheet"
  schematic_sheet_id: string
  sheet_index?: number
  display_name?: string
  displayName?: string
  name?: string
}

type ElementWithSchematicSheetMetadata = AnyCircuitElement & {
  schematic_sheet_id?: string
  schematic_component_id?: string
}

export interface SchematicSheetFile {
  schematicSheetId: string
  displayName: string
  filename: string
  kicadSheetUuid: string
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

const isSchematicSheetElement = (
  element: AnyCircuitElement,
): element is SchematicSheetElement => element.type === "schematic_sheet"

const isSchematicElement = (element: AnyCircuitElement): boolean =>
  element.type.startsWith("schematic_")

export const getSchematicSheetFiles = (
  circuitJson: CircuitJson,
): SchematicSheetFile[] => {
  return circuitJson
    .filter(isSchematicSheetElement)
    .sort((a, b) => {
      const aIndex = a.sheet_index ?? 0
      const bIndex = b.sheet_index ?? 0
      if (aIndex !== bIndex) return aIndex - bIndex
      return String(a.name ?? a.schematic_sheet_id).localeCompare(
        String(b.name ?? b.schematic_sheet_id),
      )
    })
    .map((sheet, index) => {
      const sheetIndex = sheet.sheet_index ?? index
      const displayName =
        sheet.display_name ??
        sheet.displayName ??
        sheet.name ??
        `Sheet ${sheetIndex + 1}`

      return {
        schematicSheetId: sheet.schematic_sheet_id,
        displayName,
        filename: `Sheet_${sheetIndex + 1}.kicad_sch`,
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

  for (const element of circuitJson as ElementWithSchematicSheetMetadata[]) {
    if (
      element.type === "schematic_component" &&
      element.schematic_sheet_id === schematicSheetId &&
      element.schematic_component_id
    ) {
      componentIdsOnSheet.add(element.schematic_component_id)
    }
  }

  return circuitJson.filter((element) => {
    const schematicElement = element as ElementWithSchematicSheetMetadata
    if (element.type === "schematic_sheet") return false
    if (schematicElement.schematic_sheet_id === schematicSheetId) return true
    if (
      schematicElement.schematic_component_id &&
      componentIdsOnSheet.has(schematicElement.schematic_component_id)
    ) {
      return true
    }

    return !isSchematicElement(element)
  })
}
