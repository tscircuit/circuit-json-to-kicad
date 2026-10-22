import { expect, test } from "bun:test"
import {
  render,
  expectNativeParity,
  getPadNet,
  exportNativeSchematicParity,
} from "../../fixtures/native-net-parity"
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadSchConverter,
} from "lib"
import { parseKicadPcb } from "kicadts"
import { exportNativeSchematicNets } from "../../fixtures/export-native-schematic-nets"

test("unused-pin collisions preserve connectivity without adding labels", async () => {
  for (const name of ["Net-(R1-Pad1)", "unconnected-(R1-Pad1)"]) {
    const circuit = await render(
      <board
        width="20mm"
        height="10mm"
        routingDisabled
        schMaxTraceDistance={100}
      >
        <resistor name="R1" resistance="1k" footprint="0603" schX={-3} />
        <resistor name="R2" resistance="1k" footprint="0603" schX={3} />
        <netlabel net="NAMED" schX={5} schY={1} connectsTo=".R2 > .pin2" />
      </board>,
    )
    for (const label of circuit.filter((e) => e.type === "schematic_net_label"))
      label.text = name
    const native = await exportNativeSchematicNets(circuit)
    expect(native).toContainEqual({
      name: name.startsWith("unconnected")
        ? "unconnected-(R1-Pad1)"
        : "unconnected-(R1-Pad1)_1",
      pins: ["R1.1"],
    })
    expect(native).toContainEqual({ name, pins: ["R2.2"] })
    if (name.startsWith("unconnected")) {
      // Native schematic export has two distinct net codes with the same name.
      // KiCad's PCB reader would merge them even if we wrote different PCB IDs.
      expect(native.filter((net) => net.name === name)).toHaveLength(2)
      for (const input of [circuit, [...circuit].reverse()]) {
        const before = JSON.stringify(input)
        const converter = new CircuitJsonToKicadPcbConverter(input)
        converter.runUntilFinished()
        const pcb = parseKicadPcb(converter.getOutputString())
        const unused = getPadNet(pcb, "R1", "1")
        const named = getPadNet(pcb, "R2", "2")
        // Both native names cannot be retained in a PCB without joining the nets.
        // Keep the explicit label and disambiguate the unused pin's PCB name.
        expect(named.name).toBe(name)
        expect(unused.name).toBe(`${name}_1`)
        expect(named.id).not.toBe(unused.id)
        expect(new Set(pcb.nets.map((net) => net.name)).size).toBe(
          pcb.nets.length,
        )
        expect(JSON.stringify(input)).toBe(before)
        const schematic = new CircuitJsonToKicadSchConverter(input)
        schematic.runUntilFinished()
        expect(schematic.getOutput().globalLabels).toHaveLength(1)
        expect(schematic.getOutput().labels).toHaveLength(0)
      }
      // KiCad's schematic-parity checker accepts suffixed unconnected names.
      // Verify that native KiCad accepts the board without a net-name conflict.
      const parity = await exportNativeSchematicParity(circuit)
      expect(parity.filter((error) => error.type === "net_conflict")).toEqual(
        [],
      )
    } else {
      await expectNativeParity(circuit)
    }
  }
}, 30_000)
