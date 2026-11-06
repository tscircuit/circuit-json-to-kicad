import type {
  AnyCircuitElement,
  CadComponent,
  CircuitJson,
  SchematicArc,
  SchematicCircle,
  SchematicComponent,
  SchematicLine,
  SchematicPath,
  SchematicRect,
  SchematicSymbol,
  SourceComponentBase,
} from "circuit-json"
import { getKicadCompatibleCustomSymbolName } from "../utils/getKicadCompatibleComponentName"
import { getComponentLevelLibraryId, getLibraryId } from "./getLibraryId"
import { hasComponentLevelSymbolPrimitives } from "./stages/utils/hasComponentLevelSymbolPrimitives"

type SchematicSymbolPrimitive =
  | SchematicArc
  | SchematicCircle
  | SchematicLine
  | SchematicPath
  | SchematicRect

export interface ResolvedSchematicComponentSymbol {
  cadComponent?: CadComponent
  schematicSymbol?: SchematicSymbol
  schematicSymbolId?: string
  schematicSymbolName?: string
  hasLinkedSymbolPrimitives: boolean
  usesComponentLevelSymbolPrimitives: boolean
  libraryId: string
  isChip: boolean
}

function isSchematicSymbolPrimitive(
  element: AnyCircuitElement,
): element is SchematicSymbolPrimitive {
  return (
    element.type === "schematic_arc" ||
    element.type === "schematic_circle" ||
    element.type === "schematic_line" ||
    element.type === "schematic_path" ||
    element.type === "schematic_rect"
  )
}

function findLinkedSchematicSymbolId(
  circuitJson: CircuitJson,
  schematicComponentId: string,
): string | undefined {
  return circuitJson.find(
    (element): element is SchematicSymbolPrimitive =>
      isSchematicSymbolPrimitive(element) &&
      element.schematic_component_id === schematicComponentId &&
      Boolean(element.schematic_symbol_id),
  )?.schematic_symbol_id
}

export function resolveSchematicComponentSymbol({
  circuitJson,
  schematicComponent,
  sourceComponent,
  cadComponents,
}: {
  circuitJson: CircuitJson
  schematicComponent: SchematicComponent
  sourceComponent: SourceComponentBase
  cadComponents: CadComponent[]
}): ResolvedSchematicComponentSymbol {
  const cadComponent = cadComponents.find(
    (candidate) =>
      candidate.source_component_id === sourceComponent.source_component_id,
  )
  const linkedSchematicSymbolId = findLinkedSchematicSymbolId(
    circuitJson,
    schematicComponent.schematic_component_id,
  )
  const schematicSymbolId =
    schematicComponent.schematic_symbol_id || linkedSchematicSymbolId
  const schematicSymbol = schematicSymbolId
    ? circuitJson.find(
        (element): element is SchematicSymbol =>
          element.type === "schematic_symbol" &&
          element.schematic_symbol_id === schematicSymbolId,
      )
    : undefined
  const schematicSymbolName = schematicSymbolId
    ? (schematicSymbol?.name ??
      getKicadCompatibleCustomSymbolName(
        sourceComponent,
        cadComponent,
        schematicSymbolId,
      ))
    : undefined
  const usesComponentLevelSymbolPrimitives = hasComponentLevelSymbolPrimitives(
    circuitJson,
    schematicComponent,
  )
  const libraryId = usesComponentLevelSymbolPrimitives
    ? getComponentLevelLibraryId(
        sourceComponent,
        schematicComponent,
        cadComponent,
      )
    : getLibraryId(
        sourceComponent,
        schematicComponent,
        cadComponent,
        schematicSymbolName,
      )
  const isChip =
    sourceComponent.ftype === "simple_chip" ||
    sourceComponent.ftype === "simple_pin_header" ||
    sourceComponent.ftype === "simple_connector"

  return {
    cadComponent,
    schematicSymbol,
    schematicSymbolId,
    schematicSymbolName,
    hasLinkedSymbolPrimitives: Boolean(linkedSchematicSymbolId),
    usesComponentLevelSymbolPrimitives,
    libraryId,
    isChip,
  }
}
