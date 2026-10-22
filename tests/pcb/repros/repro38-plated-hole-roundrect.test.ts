import { expect, test } from "bun:test"
import { createPlatedHoleRadiusAndMaskRepro } from "../../fixtures/plated-hole-radius-and-mask-repro"

test.failing("repro38: rect_border_radius exports as a roundrect pad", async () => {
  const { componentPads, standalonePads } =
    await createPlatedHoleRadiusAndMaskRepro()
  // 0.5mm radius on a 3mm x 2mm pad, 0.4mm radius on a 2mm x 3mm pad
  for (const [pad, expectedRatio] of [
    [componentPads[0]!, 0.25],
    [standalonePads[0]!, 0.2],
  ] as const) {
    expect(pad.shape).toBe("roundrect")
    expect(pad.roundrectRatio).toBeCloseTo(expectedRatio)
  }
})
