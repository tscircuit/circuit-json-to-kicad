import { expect, test } from "bun:test"
import { exportNativeSchematicNets } from "../../fixtures/export-native-schematic-nets"
import {
  createInlineLabelCircuit,
  createInlineLabelSheet,
} from "../../fixtures/inline-net-labels"

test("KiCad connects R1.2 and R2.1 through SIGNAL on the same sheet", async () => {
  // R1.2 --- SIGNAL       SIGNAL --- R2.1
  const nets = await exportNativeSchematicNets(createInlineLabelCircuit())
  const signalNets = nets.filter((net) => net.name?.endsWith("SIGNAL"))

  // Before the fix, KiCad reports two separate unconnected pins instead.
  expect(signalNets).toEqual([{ name: "/SIGNAL", pins: ["R1.2", "R2.1"] }])
}, 30_000)

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
