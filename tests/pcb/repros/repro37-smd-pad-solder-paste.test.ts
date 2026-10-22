import { expect, test } from "bun:test"
import { createSmdPadPasteAndMaskRepro } from "../../fixtures/smd-pad-paste-and-mask-repro"

test("repro37: pads with a pcb_solder_paste keep F.Paste", async () => {
  const { resistorFootprint } = await createSmdPadPasteAndMaskRepro()
  expect(resistorFootprint.fpPads).toHaveLength(2)
  for (const pad of resistorFootprint.fpPads) {
    expect(pad.layers?.layers).toEqual(["F.Cu", "F.Paste", "F.Mask"])
  }
})
