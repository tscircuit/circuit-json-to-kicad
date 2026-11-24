import { expect, test } from "bun:test"
import { createStandalonePlatedHolePadUuidRepro } from "../../fixtures/standalone-plated-hole-pad-uuid-repro"

// The 555-led-blinker board's four plated mounting holes should export four
// distinct pad UUIDs. The pad UUID seed includes the component id, which the
// standalone plated hole path never passes, so all four hash to one value.
test("repro39: 555 board mounting holes export unique pad UUIDs", async () => {
  const { mountingHolePads } = await createStandalonePlatedHolePadUuidRepro()
  expect(mountingHolePads).toHaveLength(4)
  expect(new Set(mountingHolePads.map((pad) => pad.uuid?.value)).size).toBe(4)
})
