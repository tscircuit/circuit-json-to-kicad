import { expect, test } from "bun:test"
import {
  renderIndependentConnections,
  getPadNet,
} from "../../fixtures/native-net-parity"
import { CircuitJsonToKicadPcbConverter } from "lib"
import { parseKicadPcb } from "kicadts"
import { exportNativeSchematicNets } from "../../fixtures/export-native-schematic-nets"

test("PCB-only name collisions keep schematic names and separate connections", async () => {
  let circuit = await renderIndependentConnections()
  const traces = circuit.filter((e) => e.type === "source_trace")
  traces[1]!.display_name = "Net-(C1-Pad1)"
  const sourceIds = new Set(
    circuit
      .filter((e) => e.type === "source_component")
      .filter((e) => ["R2", "C2"].includes(e.name!))
      .map((e) => e.source_component_id),
  )
  const componentIds = new Set(
    circuit
      .filter((e) => e.type === "schematic_component")
      .filter((e) => sourceIds.has(e.source_component_id!))
      .map((e) => e.schematic_component_id),
  )
  circuit = circuit.filter(
    (e) =>
      !e.type.startsWith("schematic_") ||
      (!("source_component_id" in e && sourceIds.has(e.source_component_id!)) &&
        !(
          "schematic_component_id" in e &&
          componentIds.has(e.schematic_component_id!)
        ) &&
        !(
          "source_trace_id" in e &&
          e.source_trace_id === traces[1]!.source_trace_id
        )),
  )
  // An existing suffixed name must remain available to its original net.
  circuit.push({
    type: "source_net",
    source_net_id: "reserved_name",
    name: "Net-(C1-Pad1)_1",
    member_source_group_ids: [],
  })
  expect(await exportNativeSchematicNets(circuit)).toContainEqual({
    name: "Net-(C1-Pad1)",
    pins: ["C1.1", "R1.2"],
  })
  for (const input of [circuit, [...circuit].reverse()]) {
    const before = JSON.stringify(input)
    const converter = new CircuitJsonToKicadPcbConverter(input)
    converter.runUntilFinished()
    const pcb = parseKicadPcb(converter.getOutputString())
    const schematicNet = getPadNet(pcb, "C1", "1")
    const pcbOnlyNet = getPadNet(pcb, "C2", "1")
    expect(schematicNet.name).toBe("Net-(C1-Pad1)")
    expect(pcbOnlyNet.name).toBe("Net-(C1-Pad1)_2")
    expect(schematicNet.id).not.toBe(pcbOnlyNet.id)
    expect(getPadNet(pcb, "R1", "2").id).toBe(schematicNet.id)
    expect(getPadNet(pcb, "R2", "2").id).toBe(pcbOnlyNet.id)
    expect(pcb.nets.some((net) => net.name === "Net-(C1-Pad1)_1")).toBe(true)
    expect(new Set(pcb.nets.map((net) => net.name)).size).toBe(pcb.nets.length)
    expect(JSON.stringify(input)).toBe(before)
  }
}, 30_000)
