import { expect, test } from "bun:test"
import {
  renderIndependentConnections,
  expectNativeParity,
} from "../../fixtures/native-net-parity"

test("PCB bridges preserve separate source nets", async () => {
  for (const removeKeys of [false, true]) {
    const circuit = await renderIndependentConnections()
    const traces = circuit.filter((e) => e.type === "source_trace")
    const ports = traces.map(
      (trace) =>
        circuit
          .filter((e) => e.type === "pcb_port")
          .find(
            (port) =>
              port.source_port_id === trace.connected_source_port_ids[0],
          )!,
    )
    circuit.push(
      {
        type: "pcb_trace",
        pcb_trace_id: "misrouted_bridge",
        source_trace_id: traces[0]!.source_trace_id,
        route: [
          {
            route_type: "wire",
            x: ports[0]!.x,
            y: ports[0]!.y,
            layer: "top",
            width: 0.2,
            start_pcb_port_id: ports[0]!.pcb_port_id,
          },
          {
            route_type: "wire",
            x: ports[1]!.x,
            y: ports[1]!.y,
            layer: "top",
            width: 0.2,
            end_pcb_port_id: ports[1]!.pcb_port_id,
          },
        ],
      },
      {
        type: "pcb_via",
        pcb_via_id: "misrouted_via",
        source_trace_id: traces[0]!.source_trace_id,
        pcb_port_ids: ports.map((port) => port.pcb_port_id),
        x: ports[0]!.x,
        y: ports[0]!.y,
        outer_diameter: 0.6,
        hole_diameter: 0.3,
        layers: ["top", "bottom"],
      },
    )
    if (removeKeys)
      for (const element of circuit) {
        if ("subcircuit_connectivity_map_key" in element)
          delete element.subcircuit_connectivity_map_key
      }
    for (const input of [circuit, [...circuit].reverse()]) {
      const { pcb, native } = await expectNativeParity(input)
      expect(native).toContainEqual({
        name: "Net-(C1-Pad1)",
        pins: ["C1.1", "R1.2"],
      })
      expect(native).toContainEqual({
        name: "Net-(C2-Pad1)",
        pins: ["C2.1", "R2.2"],
      })
      const net = pcb
        .getOutput()
        .nets.find((net) => net.name === "Net-(C1-Pad1)")!
      expect(pcb.getOutput().segments).toHaveLength(1)
      expect(pcb.getOutput().segments[0]!.net?.id).toBe(net.id)
      expect(pcb.getOutput().vias[0]!.net?.id).toBe(net.id)
    }
  }
}, 30_000)
