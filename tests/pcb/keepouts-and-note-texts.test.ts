import { expect, test } from "bun:test"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { convertCourtyardCircles } from "lib/pcb/stages/footprints-stage-converters/convertCourtyardCircles"
import { convertCourtyardOutlines } from "lib/pcb/stages/footprints-stage-converters/convertCourtyardOutlines"
import { convertNoteTexts } from "lib/pcb/stages/footprints-stage-converters/convertNoteTexts"

test("keepouts support rotated/rounded rects and convertNoteTexts/courtyard converters preserve layer, justify, rotation, and color", () => {
  const circuitJson: any[] = [
    {
      type: "pcb_board",
      pcb_board_id: "board_1",
      center: { x: 0, y: 0 },
      width: 20,
      height: 20,
      thickness: 1.6,
      num_layers: 2,
      material: "fr4",
    },
    {
      type: "pcb_keepout",
      shape: "rect",
      center: { x: 0, y: 0 },
      width: 6,
      height: 6,
      pcb_keepout_id: "ko0",
      layers: ["top"],
    },
    {
      type: "pcb_keepout",
      shape: "rect",
      center: { x: 4, y: 0 },
      width: 4,
      height: 2,
      ccw_rotation: 90,
      pcb_keepout_id: "ko_rotated",
      layer: "bottom",
    },
  ]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson as any)
  converter.runUntilFinished()
  const parsedPcb = parseKicadPcb(converter.getOutputString())
  expect(parsedPcb.zones).toHaveLength(2)

  const rotatedZone = parsedPcb.zones[1]!
  expect(rotatedZone.layers?.names).toEqual(["B.Cu"])
  const polyPts = rotatedZone.polygons[0]?.pts?.points ?? []
  const xs = polyPts.map((pt: any) => pt.x)
  const ys = polyPts.map((pt: any) => pt.y)
  expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2, 5)
  expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(4, 5)

  const fpTexts = convertNoteTexts({
    noteTexts: [
      {
        type: "pcb_note_text",
        pcb_note_text_id: "nt_bottom",
        pcb_component_id: "comp_1",
        text: "BTM NOTE",
        font: "tscircuit2024",
        font_size: 0.8,
        layer: "bottom",
        anchor_position: { x: 1, y: 2 },
        anchor_alignment: "top_left",
        ccw_rotation: 45,
      } as any,
    ],
    componentCenter: { x: 0, y: 0 },
    componentRotation: 0,
  })
  expect(fpTexts).toHaveLength(1)
  expect(fpTexts[0]?.layer?.names).toEqual(["B.Fab"])
  expect((fpTexts[0]?.position as any)?.angle).toBe(45)
  expect(fpTexts[0]?.effects?.justify?.horizontal).toBe("left")
  expect(fpTexts[0]?.effects?.justify?.vertical).toBe("top")
  expect(fpTexts[0]?.effects?.justify?.mirror).toBe(true)

  const circles = convertCourtyardCircles(
    [
      {
        type: "pcb_courtyard_circle",
        pcb_courtyard_circle_id: "cc1",
        pcb_component_id: "comp_1",
        center: { x: 0, y: 0 },
        radius: 2,
        layer: "B.CrtYd" as any,
        color: "#ff0000",
      } as any,
    ],
    { footprintOrigin: { x: 0, y: 0 } },
  )
  expect(circles[0]?.layer?.names).toEqual(["B.CrtYd"])
  expect(circles[0]?.stroke?.color?.r).toBe(255)

  const outlines = convertCourtyardOutlines({
    courtyardOutlines: [
      {
        type: "pcb_courtyard_outline",
        pcb_courtyard_outline_id: "co1",
        pcb_component_id: "comp_1",
        layer: "B.CrtYd" as any,
        outline: [
          { x: -1, y: -1 },
          { x: 1, y: -1 },
          { x: 1, y: 1 },
        ],
        color: "#00ff00",
      } as any,
    ],
    componentCenter: { x: 0, y: 0 },
  })
  expect(outlines[0]?.layer?.names).toEqual(["B.CrtYd"])
  expect(outlines[0]?.stroke?.color?.g).toBe(255)
})
