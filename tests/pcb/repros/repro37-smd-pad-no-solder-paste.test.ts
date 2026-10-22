import { expect, test } from "bun:test"
import { createSmdPadPasteAndMaskRepro } from "../../fixtures/smd-pad-paste-and-mask-repro"

test("repro37: a pad without pcb_solder_paste gets no F.Paste", async () => {
  const { probePadFootprint } = await createSmdPadPasteAndMaskRepro()
  expect(probePadFootprint.fpPads[0]!.layers?.layers).toEqual([
    "F.Cu",
    "F.Mask",
  ])
})
