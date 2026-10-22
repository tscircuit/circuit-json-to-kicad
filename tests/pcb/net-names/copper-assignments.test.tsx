import { expect, test } from "bun:test"
import { render, expectNativeParity } from "../../fixtures/native-net-parity"

test("pad, track, via and pour share the resolved net", async () => {
  const circuit = await render(
    <board width="20mm" height="10mm">
      <resistor name="R1" resistance="1k" footprint="0603" pcbX={-3} />
      <capacitor name="C1" capacitance="1uF" footprint="0603" pcbX={3} />
      <trace from=".R1 > .pin2" to=".C1 > .pin1" />
    </board>,
  )
  const trace = circuit.find((e) => e.type === "source_trace")!
  const sourceNetId = "source_net_copper"
  trace.connected_source_net_ids.push(sourceNetId)
  circuit.push(
    {
      type: "source_net",
      source_net_id: sourceNetId,
      name: "copper",
      member_source_group_ids: [],
      subcircuit_connectivity_map_key: trace.subcircuit_connectivity_map_key,
    },
    {
      type: "pcb_via",
      pcb_via_id: "pcb_via_copper",
      x: 0,
      y: 0,
      outer_diameter: 0.6,
      hole_diameter: 0.3,
      layers: ["top", "bottom"],
      source_net_id: sourceNetId,
    },
    {
      type: "pcb_copper_pour",
      pcb_copper_pour_id: "pour",
      shape: "rect",
      layer: "top",
      center: { x: 0, y: 0 },
      width: 5,
      height: 2,
      source_net_id: sourceNetId,
      covered_with_solder_mask: true,
    },
  )
  for (const element of circuit) {
    if ("subcircuit_connectivity_map_key" in element)
      delete element.subcircuit_connectivity_map_key
  }
  const { pcb } = await expectNativeParity(circuit)
  const output = pcb.getOutput()
  const net = output.nets.find((net) => net.name === "Net-(C1-Pad1)")!
  expect(output.segments.length).toBeGreaterThan(0)
  expect(output.segments.every((segment) => segment.net?.id === net.id)).toBe(
    true,
  )
  expect(output.vias).toHaveLength(1)
  expect(output.vias[0]!.net?.id).toBe(net.id)
  expect(output.zones).toHaveLength(1)
  expect(output.zones[0]!.net).toBe(net.id)
}, 30_000)
