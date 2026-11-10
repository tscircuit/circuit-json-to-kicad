import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"

test("exports standalone schematic_rect elements even when no component-level symbol primitives exist", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="10mm">
      <schematicrect
        schX={0}
        schY={0}
        width={2}
        height={1.5}
        isFilled={false}
      />
    </board>,
  )
  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadSchConverter(circuit.getCircuitJson())
  converter.runUntilFinished()

  const parsed = parseKicadSch(converter.getOutputString())
  expect(parsed.rectangles).toHaveLength(1)
  const rect = parsed.rectangles?.[0]
  expect(rect?.fill?.type).toBe("none")
  expect(Math.abs((rect?.end?.x ?? 0) - (rect?.start?.x ?? 0))).toBeCloseTo(
    2 * 15,
    3,
  )
  expect(Math.abs((rect?.end?.y ?? 0) - (rect?.start?.y ?? 0))).toBeCloseTo(
    1.5 * 15,
    3,
  )
})

test("exports rotated standalone schematic_rect and standalone schematic_path as KiCad polylines", () => {
  const circuitJson = [
    {
      type: "schematic_rect" as const,
      schematic_rect_id: "sch_rect_filled",
      center: { x: 0, y: 0 },
      width: 3,
      height: 2,
      rotation: 0,
      stroke_width: 0.05,
      is_dashed: false,
      is_filled: true,
      fill_color: "#224466",
      color: "#112233",
    },
    {
      type: "schematic_rect" as const,
      schematic_rect_id: "sch_rect_rot",
      center: { x: 4, y: -2 },
      width: 2,
      height: 1,
      rotation: 45,
      stroke_width: 0.05,
      is_dashed: true,
      is_filled: false,
      color: "#112233",
    },
    {
      type: "schematic_path" as const,
      schematic_path_id: "sch_path_1",
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 1, y: 1.5 },
        { x: 0, y: 0 },
      ],
      stroke_width: 0.04,
      stroke_color: "#334455",
      is_dashed: false,
      is_filled: false,
    },
  ]

  const converter = new CircuitJsonToKicadSchConverter(circuitJson as any)
  converter.runUntilFinished()

  const output = converter.getOutputString()
  const parsed = parseKicadSch(output)
  expect(parsed.rectangles).toHaveLength(1)
  expect(parsed.rectangles?.[0]?.fill?.type).toBe("color")
  expect(parsed.polylines).toHaveLength(2)
  expect(parsed.polylines?.[0]?.points?.points).toHaveLength(4)
  expect(parsed.polylines?.[1]?.points?.points).toHaveLength(5)
  expect(output).toContain("(color 34 68 102 1)")
  expect(output).toContain("(color 17 34 51 1)")
  expect(output).toContain("(color 51 68 85 1)")
})
