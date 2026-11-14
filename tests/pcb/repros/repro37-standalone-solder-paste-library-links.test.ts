import { expect, test } from "bun:test"
import type { CircuitJson, PcbSolderPaste } from "circuit-json"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

const rectPaste = ({
  id,
  x,
  width,
  height,
  layer = "top",
}: {
  id: string
  x: number
  width: number
  height: number
  layer?: "top" | "bottom"
}): PcbSolderPaste => ({
  type: "pcb_solder_paste",
  shape: "rect",
  pcb_solder_paste_id: id,
  layer,
  x,
  y: 0,
  width,
  height,
})

test("repro37: standalone paste footprint names identify their geometry", () => {
  const circuitJson: CircuitJson = [
    rectPaste({ id: "paste_1x1_a", x: -6, width: 1, height: 1 }),
    rectPaste({ id: "paste_3x2", x: -2, width: 3, height: 2 }),
    rectPaste({ id: "paste_1x1_b", x: 3, width: 1, height: 1 }),
    rectPaste({
      id: "paste_1x1_bottom",
      x: 6,
      width: 1,
      height: 1,
      layer: "bottom",
    }),
  ]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const pcb = KicadPcb.parse(converter.getOutputString())[0] as KicadPcb

  expect(pcb.footprints.map((footprint) => footprint.libraryLink)).toEqual([
    "tscircuit:solderpaste_top_rect_width1mm_height1mm",
    "tscircuit:solderpaste_top_rect_width3mm_height2mm",
    "tscircuit:solderpaste_top_rect_width1mm_height1mm",
    "tscircuit:solderpaste_bottom_rect_width1mm_height1mm",
  ])
})
