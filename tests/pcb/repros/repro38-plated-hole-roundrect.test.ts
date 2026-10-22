import { expect, test } from "bun:test"
import { createPlatedHoleRoundedPadRepro } from "../../fixtures/plated-hole-rounded-pad-repro"

// J1's rounded pin 1 (rect_border_radius 0.3) should export as a KiCad
// roundrect pad, using the same radius / min(width, height) ratio as SMD pads.
test("repro38: 555 board J1 rounded pin 1 exports as a roundrect pad", async () => {
  const { pin1PlatedHole, pin1Pad } = await createPlatedHoleRoundedPadRepro()
  if (!("rect_pad_width" in pin1PlatedHole))
    throw new Error("expected a rect pad")
  expect(pin1PlatedHole.rect_border_radius).toBe(0.3)
  expect(pin1Pad.shape).toBe("roundrect")
  expect(pin1Pad.roundrectRatio).toBeCloseTo(
    0.3 /
      Math.min(pin1PlatedHole.rect_pad_width, pin1PlatedHole.rect_pad_height),
  )
})
