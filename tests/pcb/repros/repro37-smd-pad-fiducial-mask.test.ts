import { expect, test } from "bun:test"
import { createSmdPadPasteAndMaskRepro } from "../../fixtures/smd-pad-paste-and-mask-repro"

test("repro37: a fiducial keeps its F.Mask pullback opening", async () => {
  const { fiducialFootprint } = await createSmdPadPasteAndMaskRepro()
  expect(fiducialFootprint.fpPads[0]!.layers?.layers).toEqual([
    "F.Cu",
    "F.Mask",
  ])
})
