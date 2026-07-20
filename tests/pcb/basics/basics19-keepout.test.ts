import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("pcb basics19 keepout rect exported as KiCad rule-area zone", () => {
  const circuitJson: any[] = [
    {
      type: "pcb_board",
      pcb_board_id: "board0",
      center: { x: 0, y: 0 },
      width: 20,
      height: 20,
      thickness: 1.6,
      num_layers: 2,
    },
    {
      type: "pcb_keepout",
      pcb_keepout_id: "keepout0",
      shape: "rect",
      center: { x: 0, y: 0 },
      width: 4,
      height: 12,
      layers: ["top", "bottom"],
    },
  ]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const outputString = converter.getOutputString()

  expect(outputString).toContain("(zone")
  expect(outputString).toContain("(keepout")
  expect(outputString).toContain("(tracks not_allowed)")
  expect(outputString).toContain("(vias not_allowed)")
  expect(outputString).toContain("(copperpour not_allowed)")
  expect(outputString).toContain("(pads allowed)")
  expect(outputString).toContain("(footprints allowed)")
  expect(outputString).toContain("(polygon")
  // multi-layer keepout uses (layers ...) not (layer ...)
  expect(outputString).toContain("F.Cu")
  expect(outputString).toContain("B.Cu")
})

test("pcb basics19 keepout circle exported as KiCad rule-area zone", () => {
  const circuitJson: any[] = [
    {
      type: "pcb_board",
      pcb_board_id: "board0",
      center: { x: 0, y: 0 },
      width: 20,
      height: 20,
      thickness: 1.6,
      num_layers: 2,
    },
    {
      type: "pcb_keepout",
      pcb_keepout_id: "keepout1",
      shape: "circle",
      center: { x: 0, y: 0 },
      radius: 3,
      layers: ["top"],
    },
  ]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const outputString = converter.getOutputString()

  expect(outputString).toContain("(zone")
  expect(outputString).toContain("(keepout")
  expect(outputString).toContain("(layer F.Cu)")
  expect(outputString).toContain("(tracks not_allowed)")
  expect(outputString).toContain("(polygon")
})
