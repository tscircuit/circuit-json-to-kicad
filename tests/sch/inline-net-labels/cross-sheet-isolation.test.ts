import { expect, test } from "bun:test"
import { exportNativeSchematicNets } from "../../fixtures/export-native-schematic-nets"
import { createInlineLabelSheet } from "../../fixtures/inline-net-labels"

test("KiCad keeps same-named SIGNAL connections on different sheets separate", async () => {
  const circuit = [
    ...createInlineLabelSheet({ name: "First", resistorNames: ["R1", "R2"] }),
    ...createInlineLabelSheet({ name: "Second", resistorNames: ["R3", "R4"] }),
  ]
  const nets = await exportNativeSchematicNets(circuit)
  const signalNets = nets.filter((net) => net.name?.endsWith("SIGNAL"))

  // Global labels would incorrectly join all four pins into one connection.
  expect(signalNets).toEqual([
    { name: "/First/SIGNAL", pins: ["R1.2", "R2.1"] },
    { name: "/Second/SIGNAL", pins: ["R3.2", "R4.1"] },
  ])
}, 30_000)
