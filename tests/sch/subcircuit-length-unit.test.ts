import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "../../lib"

test("an inch-long graphic with a 0.01-inch pen exports in KiCad millimeters", () => {
  const converter = new CircuitJsonToKicadSchConverter(
    [
      {
        type: "source_group",
        source_group_id: "g",
        is_subcircuit: true,
        subcircuit_id: "s",
        default_schematic_length_unit: "in",
      },
      {
        type: "schematic_line",
        schematic_line_id: "line",
        subcircuit_id: "s",
        x1: 0,
        x2: 1,
        y1: 0,
        y2: 0,
        stroke_width: 0.01,
        color: "#000000",
        is_dashed: false,
      },
    ],
    { schematicSheets: [{ circuitOrigin: { x: 20, y: 30 } }] },
  )
  converter.runUntilFinished()
  const line = converter.getOutput().polylines[0]!
  expect(line.stroke?.width).toBeCloseTo(0.254, 8)
  expect(line.points?.getString()).toContain("(xy 45.4 30)")
})
