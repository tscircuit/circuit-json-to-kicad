import { expect, test } from "bun:test"
import type {
  CircuitJson,
  PcbSmtPadCircle,
  PcbSolderPasteCircle,
} from "circuit-json"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { KicadPcb } from "kicadts"

test("pad with is_covered_with_solder_mask: true omits Mask and Paste layers", () => {
  const circuitJson: CircuitJson = [
    {
      type: "pcb_smtpad",
      shape: "circle",
      pcb_smtpad_id: "pad_covered_1",
      x: 0,
      y: 0,
      radius: 0.5,
      layer: "top",
      is_covered_with_solder_mask: true,
    } as PcbSmtPadCircle,
  ]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const kicadPcb = KicadPcb.parse(converter.getOutputString())[0] as KicadPcb
  expect(kicadPcb.footprints.length).toBe(1)
  const pad = kicadPcb.footprints[0].fpPads[0]
  expect(pad.layers?.layers).toEqual(["F.Cu"])
})

test("uncovered pad without pcb_solder_paste in a circuit with solder paste elements omits Paste layer", () => {
  const circuitJson: CircuitJson = [
    {
      type: "pcb_smtpad",
      shape: "circle",
      pcb_smtpad_id: "pad_with_paste",
      x: -5,
      y: 0,
      radius: 0.5,
      layer: "top",
      is_covered_with_solder_mask: false,
    } as PcbSmtPadCircle,
    {
      type: "pcb_solder_paste",
      shape: "circle",
      pcb_solder_paste_id: "paste_1",
      pcb_smtpad_id: "pad_with_paste",
      x: -5,
      y: 0,
      radius: 0.5,
      layer: "top",
    } as PcbSolderPasteCircle,
    {
      type: "pcb_smtpad",
      shape: "circle",
      pcb_smtpad_id: "probe_pad_no_paste",
      x: 5,
      y: 0,
      radius: 0.5,
      layer: "top",
      is_covered_with_solder_mask: false,
    } as PcbSmtPadCircle,
  ]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const kicadPcb = KicadPcb.parse(converter.getOutputString())[0] as KicadPcb
  expect(kicadPcb.footprints.length).toBe(2)

  // First footprint is pad_with_paste
  const padWithPaste = kicadPcb.footprints[0].fpPads[0]
  expect(padWithPaste).toBeDefined()
  expect(padWithPaste.layers?.layers).toEqual(["F.Cu", "F.Paste", "F.Mask"])

  // Second footprint is probe_pad_no_paste
  const probePadNoPaste = kicadPcb.footprints[1].fpPads[0]
  expect(probePadNoPaste).toBeDefined()
  expect(probePadNoPaste.layers?.layers).toEqual(["F.Cu", "F.Mask"])
})
