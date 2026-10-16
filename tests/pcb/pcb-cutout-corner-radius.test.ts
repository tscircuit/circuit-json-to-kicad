import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("exports rounded rectangular pcb_cutout with corner_radius on Edge.Cuts", () => {
  const circuitJson: any[] = [
    {
      type: "pcb_board",
      pcb_board_id: "pcb_board_0",
      center: { x: 0, y: 0 },
      width: 40,
      height: 40,
      thickness: 1.6,
      num_layers: 2,
      material: "fr4",
    },
    {
      type: "pcb_cutout",
      pcb_cutout_id: "pcb_cutout_sharp",
      shape: "rect",
      center: { x: -10, y: 0 },
      width: 6,
      height: 4,
    },
    {
      type: "pcb_cutout",
      pcb_cutout_id: "pcb_cutout_rounded",
      shape: "rect",
      center: { x: 10, y: 0 },
      width: 6,
      height: 4,
      corner_radius: 1,
      rotation: 30,
    },
  ]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const output = converter.getOutput()
  // Board (4 lines) + sharp rect cutout (4 lines) + rounded rect cutout (36 lines) = 44 lines
  expect(output.graphicLines.length).toBe(44)
  expect(
    output.graphicLines.every((line) => line.layer?.names[0] === "Edge.Cuts"),
  ).toBe(true)

  // Verify the unrotated sharp cutout has exact sharp corners while the rounded one does not
  const sharpVertices = output.graphicLines.filter(
    (line) => line.start && line.start.x > 85 && line.start.x < 95,
  )
  expect(sharpVertices.length).toBe(4)

  const roundedVertices = output.graphicLines.filter(
    (line) =>
      line.start &&
      line.start.x > 105 &&
      line.start.x < 115 &&
      line.start.y > 95 &&
      line.start.y < 105,
  )
  expect(roundedVertices.length).toBe(36)
})

test("exports circle, rect, and polygon pcb_cutout elements on Edge.Cuts when pcb_board is absent", () => {
  const circuitJson: any[] = [
    {
      type: "pcb_cutout",
      pcb_cutout_id: "cutout_circle",
      shape: "circle",
      center: { x: -8.15, y: 0 },
      radius: 2,
    },
    {
      type: "pcb_cutout",
      pcb_cutout_id: "cutout_rect",
      shape: "rect",
      center: { x: 0, y: 0 },
      width: 5,
      height: 3,
      corner_radius: 0.5,
    },
    {
      type: "pcb_cutout",
      pcb_cutout_id: "cutout_poly",
      shape: "polygon",
      points: [
        { x: 5, y: -2 },
        { x: 8, y: 0 },
        { x: 5, y: 2 },
      ],
    },
  ]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const output = converter.getOutput()
  expect(output.graphicLines.length).toBeGreaterThan(50)
  expect(
    output.graphicLines.every((line) => line.layer?.names[0] === "Edge.Cuts"),
  ).toBe(true)
})
