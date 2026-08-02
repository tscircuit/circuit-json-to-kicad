import { expect, test } from "bun:test"
import type { PcbSmtPad } from "circuit-json"
import { createSmdPadFromCircuitJson } from "lib/pcb/stages/utils/CreateSmdPadFromCircuitJson"

const pcbPad = {
  type: "pcb_smtpad",
  pcb_smtpad_id: "pcb_smtpad_0",
  shape: "rect",
  layer: "top",
  x: 0,
  y: 0,
  width: 2,
  height: 1,
  is_covered_with_solder_mask: true,
  solderpaste_margin: -0.1,
} as PcbSmtPad & { solderpaste_margin: number }

test("solderpaste margin is used when explicit pad paste is absent", () => {
  const pad = createSmdPadFromCircuitJson({
    pcbPad,
    componentCenter: { x: 0, y: 0 },
    padNumber: 1,
    hasExplicitSolderPaste: false,
  })

  expect(pad.layers?.layers).toEqual(["F.Cu", "F.Paste", "F.Mask"])
  expect(pad.solderPasteMargin).toBe(-0.1)
  expect(pad.getString()).toContain("(solder_paste_margin -0.1)")
})

test("explicit pad paste takes precedence over solderpaste margin", () => {
  const pad = createSmdPadFromCircuitJson({
    pcbPad,
    componentCenter: { x: 0, y: 0 },
    padNumber: 1,
    hasExplicitSolderPaste: true,
  })

  expect(pad.layers?.layers).toEqual(["F.Cu", "F.Paste", "F.Mask"])
  expect(pad.solderPasteMargin).toBeUndefined()
  expect(pad.getString()).not.toContain("solder_paste_margin")
})
