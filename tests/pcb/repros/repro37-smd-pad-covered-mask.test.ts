import { expect, test } from "bun:test"
import { createSmdPadPasteAndMaskRepro } from "../../fixtures/smd-pad-paste-and-mask-repro"

test("repro37: a covered pad gets no F.Mask opening", async () => {
  const { coveredPadFootprint } = await createSmdPadPasteAndMaskRepro()
  expect(coveredPadFootprint.fpPads[0]!.layers?.layers).toEqual(["F.Cu"])
})
