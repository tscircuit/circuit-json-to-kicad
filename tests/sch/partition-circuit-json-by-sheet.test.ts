import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { partitionCircuitJsonBySheet } from "lib/schematic/partitionCircuitJsonBySheet"

const circuitJson = [
  {
    type: "source_net",
    source_net_id: "source_net_0",
    name: "GND",
  },
  {
    type: "schematic_sheet",
    schematic_sheet_id: "schematic_sheet_0",
    name: "child",
  },
  {
    type: "schematic_component",
    schematic_component_id: "schematic_component_0",
    schematic_sheet_id: "schematic_sheet_0",
  },
  {
    type: "schematic_port",
    schematic_port_id: "schematic_port_0",
    schematic_component_id: "schematic_component_0",
  },
  {
    type: "schematic_net_label",
    schematic_net_label_id: "child_label",
    schematic_sheet_id: "schematic_sheet_0",
    text: "GND",
  },
  {
    type: "schematic_net_label",
    schematic_net_label_id: "root_label",
    text: "GND",
  },
  {
    type: "schematic_symbol",
    schematic_symbol_id: "schematic_symbol_0",
  },
  {
    type: "schematic_group",
    schematic_group_id: "schematic_group_0",
  },
] as unknown as CircuitJson

const idsFor = (elements: CircuitJson) =>
  elements.map(
    (element: any) =>
      element.schematic_net_label_id ??
      element.schematic_port_id ??
      element.schematic_component_id ??
      element.schematic_symbol_id ??
      element.schematic_group_id ??
      element.source_net_id,
  )

test("unassigned placed elements remain on the root schematic", () => {
  const rootIds = idsFor(partitionCircuitJsonBySheet(circuitJson, null))

  expect(rootIds).toContain("root_label")
  expect(rootIds).toContain("schematic_group_0")
  expect(rootIds).not.toContain("child_label")
})

test("child schematics only receive their placed elements and shared definitions", () => {
  const childIds = idsFor(
    partitionCircuitJsonBySheet(circuitJson, "schematic_sheet_0"),
  )

  expect(childIds).toContain("source_net_0")
  expect(childIds).toContain("schematic_component_0")
  expect(childIds).toContain("schematic_port_0")
  expect(childIds).toContain("child_label")
  expect(childIds).toContain("schematic_symbol_0")
  expect(childIds).not.toContain("root_label")
  expect(childIds).not.toContain("schematic_group_0")
})
