import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "../../lib"

test("uses the matching source origin for each schematic sheet", () => {
  const circuitJson: CircuitJson = [
    {
      type: "schematic_sheet",
      schematic_sheet_id: "sheet-a",
      sheet_index: 0,
    },
    {
      type: "schematic_sheet",
      schematic_sheet_id: "sheet-b",
      sheet_index: 1,
    },
    {
      type: "source_net",
      source_net_id: "net-a",
      name: "A",
      member_source_group_ids: [],
    },
    {
      type: "source_net",
      source_net_id: "net-b",
      name: "B",
      member_source_group_ids: [],
    },
    {
      type: "schematic_net_label",
      schematic_net_label_id: "label-a",
      schematic_sheet_id: "sheet-a",
      source_net_id: "net-a",
      center: { x: 0, y: 0 },
      anchor_position: { x: 0, y: 0 },
      anchor_side: "left",
      text: "A",
    },
    {
      type: "schematic_net_label",
      schematic_net_label_id: "label-b",
      schematic_sheet_id: "sheet-b",
      source_net_id: "net-b",
      center: { x: 0, y: 0 },
      anchor_position: { x: 0, y: 0 },
      anchor_side: "left",
      text: "B",
    },
  ]
  const converter = new CircuitJsonToKicadSchConverter(circuitJson, {
    schematicSheets: [
      {
        schematicSheetId: "sheet-a",
        circuitOrigin: { x: 25, y: 30 },
      },
      {
        schematicSheetId: "sheet-b",
        circuitOrigin: { x: 75, y: 80 },
      },
    ],
  })

  const childSchematics = converter
    .getOutputFiles({ schematicFilename: "root.kicad_sch" })
    .slice(1)
    .map((file) => parseKicadSch(file.content))

  expect(
    childSchematics.map((schematic) => ({
      x: schematic.globalLabels[0]?.at?.x,
      y: schematic.globalLabels[0]?.at?.y,
    })),
  ).toEqual([
    { x: 25, y: 30 },
    { x: 75, y: 80 },
  ])
})
