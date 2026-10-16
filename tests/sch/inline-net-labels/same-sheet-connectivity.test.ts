import { expect, test } from "bun:test"
import { exportNativeSchematicNets } from "../../fixtures/export-native-schematic-nets"
import { createInlineLabelCircuit } from "../../fixtures/inline-net-labels"

test("KiCad connects R1.2 and R2.1 through SIGNAL on the same sheet", async () => {
  // R1.2 --- SIGNAL       SIGNAL --- R2.1
  const nets = await exportNativeSchematicNets(createInlineLabelCircuit())
  const signalNets = nets.filter((net) => net.name?.endsWith("SIGNAL"))

  // Before the fix, KiCad reports two separate unconnected pins instead.
  expect(signalNets).toEqual([{ name: "/SIGNAL", pins: ["R1.2", "R2.1"] }])
}, 30_000)
