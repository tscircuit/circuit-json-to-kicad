import { expect, test } from "bun:test"
import { createPlatedHoleRadiusAndMaskRepro } from "../../fixtures/plated-hole-radius-and-mask-repro"

test("repro38: soldermask_margin exports as solder_mask_margin", async () => {
  const { componentPads, standalonePads } =
    await createPlatedHoleRadiusAndMaskRepro()
  expect(componentPads[1]!.solderMaskMargin).toBe(0.3)
  expect(standalonePads[1]!.solderMaskMargin).toBe(0.3)
})
