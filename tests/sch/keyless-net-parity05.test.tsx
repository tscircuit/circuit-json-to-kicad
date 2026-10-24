import { expect, test } from "bun:test"
import { pcb_via } from "circuit-json"
import { Circuit } from "tscircuit"
import { getNativeNetParity } from "../fixtures/get-native-net-conflicts"
import {
  expectValidSourceRows,
  readPcb,
  removeConnectivityKeys,
} from "../fixtures/keyless-net-parity"

test("a PCB bridge does not merge two independent keyless source nets", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="30mm" height="20mm" routingDisabled schMaxTraceDistance={100}>
      <resistor
        name="R1"
        resistance="1k"
        footprint="0603"
        schX={-4}
        schY={-4}
        pcbX={-4}
        pcbY={-4}
      />
      <capacitor
        name="C1"
        capacitance="1uF"
        footprint="0603"
        schX={4}
        schY={-4}
        pcbX={4}
        pcbY={-4}
      />
      <resistor
        name="R2"
        resistance="1k"
        footprint="0603"
        schX={-4}
        schY={4}
        pcbX={-4}
        pcbY={4}
      />
      <capacitor
        name="C2"
        capacitance="1uF"
        footprint="0603"
        schX={4}
        schY={4}
        pcbX={4}
        pcbY={4}
      />
      <trace from=".R1 > .pin2" to=".C1 > .pin1" />
      <trace from=".R2 > .pin2" to=".C2 > .pin1" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  removeConnectivityKeys(circuitJson)
  expectValidSourceRows(circuitJson)
  const traces = circuitJson.filter((row) => row.type === "source_trace")
  expect(traces).toHaveLength(2)
  for (const trace of traces) {
    expect(trace.subcircuit_connectivity_map_key).toBeUndefined()
    expect(trace.connected_source_port_ids).toHaveLength(2)
    expect(trace.connected_source_net_ids).toEqual([])
  }
  expect(circuitJson.filter((row) => row.type === "source_net")).toHaveLength(0)
  expect(circuitJson.filter((row) => row.type === "pcb_trace")).toHaveLength(0)
  expect(
    traces[0]!.connected_source_port_ids.some((id) =>
      traces[1]!.connected_source_port_ids.includes(id),
    ),
  ).toBe(false)
  const ports = traces.map(
    (trace) =>
      circuitJson
        .filter((row) => row.type === "pcb_port")
        .find(
          (port) => port.source_port_id === trace.connected_source_port_ids[0],
        )!,
  )
  expect(ports.every((port) => port !== undefined)).toBe(true)
  const firstReferences = traces[0]!.connected_source_port_ids.map((id) => {
    const port = circuitJson
      .filter((row) => row.type === "source_port")
      .find((port) => port.source_port_id === id)!
    return circuitJson
      .filter((row) => row.type === "source_component")
      .find(
        (component) =>
          component.source_component_id === port.source_component_id,
      )!.name
  })
  expect(firstReferences.sort()).toEqual(["C1", "R1"])
  // Deliberately inconsistent copper must not redefine the source connections.
  circuitJson.push({
    type: "pcb_trace",
    pcb_trace_id: "keyless_bridge",
    source_trace_id: traces[0]!.source_trace_id,
    route: [
      {
        route_type: "wire",
        x: ports[0]!.x,
        y: ports[0]!.y,
        width: 0.2,
        layer: "top",
        start_pcb_port_id: ports[0]!.pcb_port_id,
      },
      {
        route_type: "wire",
        x: ports[1]!.x,
        y: ports[1]!.y,
        width: 0.2,
        layer: "top",
        end_pcb_port_id: ports[1]!.pcb_port_id,
      },
    ],
  })

  // Explicit source/trace references must survive an ambiguous copper bridge.
  const sourceVia = pcb_via.parse({
    type: "pcb_via",
    pcb_via_id: "keyless_source_via",
    source_trace_id: traces[0]!.source_trace_id,
    pcb_port_ids: ports.map((port) => port.pcb_port_id),
    x: 0,
    y: 0,
    layers: ["top", "bottom"],
    outer_diameter: 0.6,
    hole_diameter: 0.3,
  })
  expect(sourceVia.source_trace_id).toBe(traces[0]!.source_trace_id)
  const traceVia = pcb_via.parse({
    ...sourceVia,
    pcb_via_id: "keyless_pcb_trace_via",
    source_trace_id: undefined,
    pcb_trace_id: "keyless_bridge",
    x: 1,
  })
  expect(traceVia.pcb_trace_id).toBe("keyless_bridge")
  circuitJson.push(sourceVia, traceVia)

  const { conflicts, nets } = await getNativeNetParity(circuitJson)
  expect(conflicts).toEqual([])
  expect(nets.find((net) => net.pins.includes("R1.2"))?.pins).toEqual([
    "C1.1",
    "R1.2",
  ])
  expect(nets.find((net) => net.pins.includes("R2.2"))?.pins).toEqual([
    "C2.1",
    "R2.2",
  ])
  const { pcb, pads } = readPcb(circuitJson)
  expect(pads.get("R1.2")?.id).not.toBe(pads.get("R2.2")?.id)
  const bridgeNet = pads.get("R1.2")!
  expect(bridgeNet.id).toBeGreaterThan(0)
  expect(pcb.segments).toHaveLength(1)
  expect(pcb.segments[0]!.net?.id).toBe(bridgeNet.id)
  expect(pcb.vias).toHaveLength(2)
  expect(pcb.vias.every((via) => via.net?.id === bridgeNet.id)).toBe(true)
}, 30_000)
