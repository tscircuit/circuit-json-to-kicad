import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib"

const convertCircuitJsonToKicadPcb = (circuitJson: any[]) => {
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  return converter.getOutputString()
}

const circuitJson: any[] = [
  {
    type: "pcb_board",
    pcb_board_id: "board0",
    center: { x: 0, y: 0 },
    width: 30,
    height: 20,
    num_layers: 2,
    thickness: 1.6,
  },
  {
    type: "pcb_cutout",
    pcb_cutout_id: "cut_circle",
    shape: "circle",
    center: { x: 0, y: 0 },
    radius: 2,
  },
  {
    type: "pcb_cutout",
    pcb_cutout_id: "cut_rect",
    shape: "rect",
    center: { x: -10, y: 0 },
    width: 5,
    height: 3,
  },
  {
    type: "pcb_cutout",
    pcb_cutout_id: "cut_poly",
    shape: "polygon",
    points: [
      { x: 5, y: -2 },
      { x: 8, y: 0 },
      { x: 5, y: 2 },
      { x: 6, y: 0 },
    ],
  },
]

test("pcb_cutout shapes appear on Edge.Cuts in KiCad PCB output", () => {
  const output = convertCircuitJsonToKicadPcb(circuitJson)

  // Circle cutout → gr_circle on Edge.Cuts
  expect(output).toContain("gr_circle")
  expect(output).toContain("Edge.Cuts")

  // Rect cutout → gr_line segments on Edge.Cuts (4 sides)
  const edgeCutsLineMatches = output.match(/gr_line[\s\S]*?Edge\.Cuts/g) ?? []
  expect(edgeCutsLineMatches.length).toBeGreaterThanOrEqual(4)

  // Polygon cutout → gr_poly on Edge.Cuts
  expect(output).toContain("gr_poly")
})
