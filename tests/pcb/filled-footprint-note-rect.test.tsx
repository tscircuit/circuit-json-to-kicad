import { expect, test } from "bun:test"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

test("filled footprint PCB note rectangles retain their fill", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="26mm" height="16mm" routingDisabled>
      <chip
        name="U1"
        footprint={
          <footprint>
            <smtpad
              portHints={["pin1"]}
              pcbX={0}
              pcbY={-4}
              width={1}
              height={1}
              shape="rect"
            />
            <pcbnoterect
              pcbX={-6}
              pcbY={1}
              width={7}
              height={4}
              strokeWidth={0.2}
              isFilled
            />
            <pcbnoterect
              pcbX={6}
              pcbY={1}
              width={7}
              height={4}
              strokeWidth={0.2}
              isFilled={false}
            />
          </footprint>
        }
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const pcb = parseKicadPcb(converter.getOutputString())
  const rectangles = pcb.footprints.flatMap((footprint) => footprint.fpRects)
  expect(rectangles).toHaveLength(2)

  const filled = rectangles.find((rectangle) => (rectangle.start?.x ?? 0) < 0)!
  const outline = rectangles.find((rectangle) => (rectangle.start?.x ?? 0) > 0)!
  expect(filled.fill).toBe(true)
  expect(outline.fill).toBe(false)
})

test("rotated filled footprint note and fabrication note rectangles preserve fill and stroke style on fp_poly", () => {
  const circuitJson: any = [
    {
      type: "pcb_board",
      pcb_board_id: "pcb_board_0",
      center: { x: 0, y: 0 },
      width: 20,
      height: 20,
    },
    {
      type: "source_component",
      source_component_id: "source_component_0",
      name: "U1",
      ftype: "simple_chip",
    },
    {
      type: "pcb_component",
      pcb_component_id: "pcb_component_0",
      source_component_id: "source_component_0",
      center: { x: 0, y: 0 },
      width: 10,
      height: 10,
      layer: "top",
      rotation: 45,
    },
    {
      type: "pcb_note_rect",
      pcb_note_rect_id: "pcb_note_rect_rot_0",
      pcb_component_id: "pcb_component_0",
      center: { x: -2, y: 1 },
      width: 4,
      height: 2,
      layer: "bottom",
      stroke_width: 0.15,
      is_filled: true,
      has_stroke: true,
      is_stroke_dashed: true,
    },
    {
      type: "pcb_fabrication_note_rect",
      pcb_fabrication_note_rect_id: "pcb_fab_note_rect_rot_0",
      pcb_component_id: "pcb_component_0",
      center: { x: 2, y: -1 },
      width: 3,
      height: 2,
      layer: "top",
      stroke_width: 0.2,
      is_filled: true,
      has_stroke: false,
    },
  ]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const pcb = parseKicadPcb(converter.getOutputString())
  const polys = pcb.footprints.flatMap((footprint) => footprint.fpPolys)
  expect(polys).toHaveLength(2)

  const bottomNotePoly = polys.find((poly) =>
    poly.layer?.names.includes("B.Fab"),
  )!
  const topFabPoly = polys.find((poly) => poly.layer?.names.includes("F.Fab"))!

  expect(bottomNotePoly.fill?.filled).toBe(true)
  expect(bottomNotePoly.stroke?.type).toBe("dash")
  expect(bottomNotePoly.stroke?.width).toBe(0.15)

  expect(topFabPoly.fill?.filled).toBe(true)
  expect(topFabPoly.stroke?.width).toBe(0)
})
