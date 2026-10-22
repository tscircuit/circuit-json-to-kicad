import { expect, test } from "bun:test"
import { createStandalonePlatedHolePadUuidRepro } from "../../fixtures/standalone-plated-hole-pad-uuid-repro"

test.failing("repro39: standalone plated holes export unique pad UUIDs", async () => {
  const { platedHolePads } = await createStandalonePlatedHolePadUuidRepro()
  expect(platedHolePads).toHaveLength(3)
  expect(new Set(platedHolePads.map((pad) => pad.uuid?.value)).size).toBe(3)
})
