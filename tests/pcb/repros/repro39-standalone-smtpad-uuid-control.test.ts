import { expect, test } from "bun:test"
import { createStandalonePlatedHolePadUuidRepro } from "../../fixtures/standalone-plated-hole-pad-uuid-repro"

// Control: standalone SMT pads already pass their pcb_smtpad_id.
test("repro39: standalone SMT pads export unique pad UUIDs", async () => {
  const { smtPads } = await createStandalonePlatedHolePadUuidRepro()
  expect(smtPads).toHaveLength(2)
  expect(new Set(smtPads.map((pad) => pad.uuid?.value)).size).toBe(2)
})
