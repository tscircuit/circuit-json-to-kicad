import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { createSmdPadFromCircuitJson } from "lib/pcb/stages/utils/CreateSmdPadFromCircuitJson"

test("createSmdPadFromCircuitJson: covered pad omits both Mask and Paste layers", () => {
  const topCoveredPad = createSmdPadFromCircuitJson({
    pcbPad: {
      type: "pcb_smtpad",
      shape: "rect",
      width: 1,
      height: 1,
      layer: "top",
      x: 0,
      y: 0,
      pcb_smtpad_id: "pad_top_covered",
      is_covered_with_solder_mask: true,
    } as any,
    componentCenter: { x: 0, y: 0 },
    padNumber: 1,
  })

  expect(topCoveredPad.layers?.layers).toEqual(["F.Cu"])

  const bottomCoveredPad = createSmdPadFromCircuitJson({
    pcbPad: {
      type: "pcb_smtpad",
      shape: "rect",
      width: 1,
      height: 1,
      layer: "bottom",
      x: 0,
      y: 0,
      pcb_smtpad_id: "pad_bottom_covered",
      is_covered_with_solder_mask: true,
    } as any,
    componentCenter: { x: 0, y: 0 },
    padNumber: 2,
  })

  expect(bottomCoveredPad.layers?.layers).toEqual(["B.Cu"])
})

test("createSmdPadFromCircuitJson: pad-level paste disabled omits Paste layer", () => {
  const padNoPaste = createSmdPadFromCircuitJson({
    pcbPad: {
      type: "pcb_smtpad",
      shape: "rect",
      width: 1,
      height: 1,
      layer: "top",
      x: 0,
      y: 0,
      pcb_smtpad_id: "pad_no_paste",
      has_solder_paste: false,
    } as any,
    componentCenter: { x: 0, y: 0 },
    padNumber: 1,
  })

  expect(padNoPaste.layers?.layers).toEqual(["F.Cu", "F.Mask"])
})

test("CircuitJsonToKicadPcbConverter: respects circuit-json pcb_solder_paste presence and solder mask coverage", () => {
  const circuitJson: CircuitJson = [
    // Board
    {
      type: "pcb_board",
      pcb_board_id: "board1",
      center: { x: 0, y: 0 },
      width: 50,
      height: 50,
      outline: [
        { x: -25, y: -25 },
        { x: 25, y: -25 },
        { x: 25, y: 25 },
        { x: -25, y: 25 },
      ],
      thickness: 1.6,
      num_layers: 2,
    } as any,
    // Component 1 (R1)
    {
      type: "source_component",
      source_component_id: "src_c1",
      name: "R1",
      ftype: "simple_resistor",
    } as any,
    {
      type: "pcb_component",
      pcb_component_id: "pcb_c1",
      source_component_id: "src_c1",
      center: { x: -10, y: 0 },
      width: 4,
      height: 2,
      layer: "top",
      rotation: 0,
    } as any,
    // Pad 1 of R1: has solder paste
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pad_c1_p1",
      pcb_component_id: "pcb_c1",
      shape: "rect",
      x: -11,
      y: 0,
      width: 0.8,
      height: 1,
      layer: "top",
    } as any,
    // Pad 2 of R1: covered with solder mask
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pad_c1_p2",
      pcb_component_id: "pcb_c1",
      shape: "rect",
      x: -9,
      y: 0,
      width: 0.8,
      height: 1,
      layer: "top",
      is_covered_with_solder_mask: true,
    } as any,
    // Component 2 (TP1 - bare copper test point)
    {
      type: "source_component",
      source_component_id: "src_c2",
      name: "TP1",
      ftype: "simple_test_point",
    } as any,
    {
      type: "pcb_component",
      pcb_component_id: "pcb_c2",
      source_component_id: "src_c2",
      center: { x: 10, y: 0 },
      width: 2,
      height: 2,
      layer: "top",
      rotation: 0,
    } as any,
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pad_tp1",
      pcb_component_id: "pcb_c2",
      shape: "circle",
      x: 10,
      y: 0,
      radius: 0.8,
      layer: "top",
    } as any,
    // Solder paste defined ONLY for pad_c1_p1
    {
      type: "pcb_solder_paste",
      pcb_solder_paste_id: "paste_c1_p1",
      pcb_smtpad_id: "pad_c1_p1",
      shape: "rect",
      x: -11,
      y: 0,
      width: 0.8,
      height: 1,
      layer: "top",
    } as any,
  ]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const kicadPcb = KicadPcb.parse(converter.getOutputString())[0] as KicadPcb
  expect(kicadPcb).toBeDefined()

  // R1 footprint has 2 pads
  const r1Fp = kicadPcb.footprints.find((fp) => fp.fpPads?.length === 2)
  expect(r1Fp).toBeDefined()

  // Pad 1 has pcb_solder_paste -> must have F.Paste and F.Mask
  const pad1 = r1Fp!.fpPads[0]
  expect(pad1).toBeDefined()
  expect(pad1!.layers?.layers).toEqual(["F.Cu", "F.Paste", "F.Mask"])

  // Pad 2 is covered with solder mask -> must omit F.Paste and F.Mask
  const pad2 = r1Fp!.fpPads[1]
  expect(pad2).toBeDefined()
  expect(pad2!.layers?.layers).toEqual(["F.Cu"])

  // TP1 footprint has 1 pad
  const tp1Fp = kicadPcb.footprints.find(
    (fp) => fp !== r1Fp && fp.fpPads?.length === 1,
  )
  expect(tp1Fp).toBeDefined()
  // TP1 pad has NO pcb_solder_paste -> must have F.Cu and F.Mask, but NO F.Paste
  expect(tp1Fp!.fpPads[0]!.layers?.layers).toEqual(["F.Cu", "F.Mask"])
})
