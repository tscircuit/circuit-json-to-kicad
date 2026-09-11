import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "../../lib"

test("uses per-sheet hierarchy node geometry on the root schematic", () => {
  const circuitJson: CircuitJson = [
    {
      type: "schematic_sheet",
      schematic_sheet_id: "sheet-a",
      sheet_index: 0,
    },
  ]
  const converter = new CircuitJsonToKicadSchConverter(circuitJson, {
    schematicSheets: [
      {
        circuitOrigin: { x: 105, y: 148.5 },
        hierarchyNode: {
          position: { x: 177.8, y: -13.97 },
          size: { height: 10.16, width: 22.86 },
        },
        schematicSheetId: "sheet-a",
      },
    ],
  })

  const [rootFile] = converter.getOutputFiles({
    schematicFilename: "root.kicad_sch",
  })
  const rootSchematic = parseKicadSch(rootFile!.content)
  const [sheetNode] = rootSchematic.sheets

  expect({
    position: { x: sheetNode?.position?.x, y: sheetNode?.position?.y },
    size: sheetNode?.size,
  }).toEqual({
    position: { x: 177.8, y: -13.97 },
    size: { height: 10.16, width: 22.86 },
  })
})
