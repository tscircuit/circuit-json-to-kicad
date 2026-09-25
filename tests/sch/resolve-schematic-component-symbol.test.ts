import { expect, test } from "bun:test"
import type {
  CadComponent,
  CircuitJson,
  SchematicComponent,
  SourceComponentBase,
} from "circuit-json"
import { resolveSchematicComponentSymbol } from "lib/schematic/resolveSchematicComponentSymbol"

const sourceComponent = {
  type: "source_component",
  source_component_id: "source_component_1",
  name: "U1",
  ftype: "simple_chip",
} as SourceComponentBase

const schematicComponent = {
  type: "schematic_component",
  schematic_component_id: "schematic_component_1",
  source_component_id: sourceComponent.source_component_id,
  center: { x: 0, y: 0 },
  size: { width: 2, height: 1 },
  is_box_with_pins: false,
} as SchematicComponent

test("resolves a directly linked custom symbol once for both schematic stages", () => {
  const component = {
    ...schematicComponent,
    schematic_symbol_id: "schematic_symbol_1",
  }
  const circuitJson = [
    component,
    {
      type: "schematic_symbol",
      schematic_symbol_id: "schematic_symbol_1",
      name: "my_custom_symbol",
    },
  ] as CircuitJson
  const cadComponent = {
    type: "cad_component",
    cad_component_id: "cad_component_1",
    source_component_id: sourceComponent.source_component_id,
    footprinter_string: "soic8",
  } as CadComponent

  const result = resolveSchematicComponentSymbol({
    circuitJson,
    schematicComponent: component,
    sourceComponent,
    cadComponents: [cadComponent],
  })

  expect(result).toMatchObject({
    cadComponent,
    schematicSymbolId: "schematic_symbol_1",
    schematicSymbolName: "my_custom_symbol",
    hasLinkedSymbolPrimitives: false,
    usesComponentLevelSymbolPrimitives: false,
    libraryId: "Custom:my_custom_symbol",
    isChip: true,
  })
})

test("finds a custom symbol through linked primitives", () => {
  const circuitJson = [
    schematicComponent,
    {
      type: "schematic_symbol",
      schematic_symbol_id: "schematic_symbol_2",
      name: "linked_symbol",
    },
    {
      type: "schematic_line",
      schematic_line_id: "schematic_line_1",
      schematic_component_id: schematicComponent.schematic_component_id,
      schematic_symbol_id: "schematic_symbol_2",
      x1: -1,
      y1: 0,
      x2: 1,
      y2: 0,
      is_dashed: false,
    },
  ] as CircuitJson

  const result = resolveSchematicComponentSymbol({
    circuitJson,
    schematicComponent,
    sourceComponent,
    cadComponents: [],
  })

  expect(result).toMatchObject({
    schematicSymbolId: "schematic_symbol_2",
    schematicSymbolName: "linked_symbol",
    hasLinkedSymbolPrimitives: true,
    usesComponentLevelSymbolPrimitives: false,
    libraryId: "Custom:linked_symbol",
  })
})

test("gives component-level artwork a component-specific library id", () => {
  const resistor = {
    ...sourceComponent,
    name: "R1",
    ftype: "simple_resistor",
    manufacturer_part_number: "10k",
  } as SourceComponentBase
  const circuitJson = [
    schematicComponent,
    {
      type: "schematic_path",
      schematic_path_id: "schematic_path_1",
      schematic_component_id: schematicComponent.schematic_component_id,
      points: [
        { x: -1, y: 0 },
        { x: 1, y: 0 },
      ],
      is_filled: false,
      is_dashed: false,
    },
  ] as CircuitJson

  const result = resolveSchematicComponentSymbol({
    circuitJson,
    schematicComponent,
    sourceComponent: resistor,
    cadComponents: [],
  })

  expect(result).toMatchObject({
    schematicSymbolId: undefined,
    hasLinkedSymbolPrimitives: false,
    usesComponentLevelSymbolPrimitives: true,
    libraryId: "Device:R_10k_schematic_component_1",
    isChip: false,
  })
})
