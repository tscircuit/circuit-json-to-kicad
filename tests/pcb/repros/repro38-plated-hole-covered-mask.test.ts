import { expect, test } from "bun:test"
import { createPlatedHoleRadiusAndMaskRepro } from "../../fixtures/plated-hole-radius-and-mask-repro"

test.failing("repro38: covered plated holes do not open the solder mask", async () => {
  const { componentPads, standalonePads } =
    await createPlatedHoleRadiusAndMaskRepro()
  for (const pad of [componentPads[2]!, standalonePads[2]!]) {
    expect(pad.layers?.layers).toEqual(["*.Cu"])
  }
})
