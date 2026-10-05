import { expect, test } from "bun:test"
import type { CircuitJson, PcbVia, PcbTrace } from "circuit-json"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

test("pcbPath inner-layer transitions reuse the generated physical vias", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={20} height={14} layers={4}>
      <resistor name="R1" resistance="10k" footprint="0402" pcbX={-5} />
      <resistor name="R2" resistance="10k" footprint="0402" pcbX={5} />
      <trace
        from=".R1 > .pin2"
        to=".R2 > .pin1"
        pcbPath={[
          { x: -2, y: 0, via: true, fromLayer: "top", toLayer: "inner1" },
          { x: 2, y: 0, via: true, fromLayer: "inner1", toLayer: "top" },
        ]}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  expect(
    circuitJson.filter((element) => element.type === "pcb_via"),
  ).toHaveLength(2)
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  expect(converter.getOutput().vias).toHaveLength(2)
})

const physicalVia: PcbVia = {
  type: "pcb_via",
  pcb_via_id: "via1",
  pcb_trace_id: "trace1",
  x: 1,
  y: 2,
  layers: ["top", "bottom"],
  outer_diameter: 0.6,
  hole_diameter: 0.3,
}
const trace: PcbTrace = {
  type: "pcb_trace",
  pcb_trace_id: "trace1",
  route: [
    { route_type: "via", x: 1, y: 2, from_layer: "inner1", to_layer: "top" },
  ],
}
const board: CircuitJson = [
  {
    type: "pcb_board",
    pcb_board_id: "board1",
    width: 10,
    height: 10,
    center: { x: 0, y: 0 },
    thickness: 1.6,
    num_layers: 4,
    material: "fr4",
  },
]

test("a trace transition reuses its physical via's full drilled span", () => {
  const converter = new CircuitJsonToKicadPcbConverter([
    ...board,
    physicalVia,
    trace,
  ])
  converter.runUntilFinished()
  const vias = converter.getOutput().vias
  expect(vias).toHaveLength(1)
  expect(vias[0]!.layers?.names).toEqual(["F.Cu", "B.Cu"])
  expect(vias[0]!.size).toBe(0.6)
  expect(vias[0]!.drill).toBe(0.3)
})

test("a via belonging to another trace does not absorb the transition", () => {
  const converter = new CircuitJsonToKicadPcbConverter([
    ...board,
    { ...physicalVia, pcb_trace_id: "other_trace" },
    trace,
  ])
  converter.runUntilFinished()
  expect(converter.getOutput().vias).toHaveLength(2)
})

test("a physical via outside the transition's layer span does not absorb it", () => {
  const converter = new CircuitJsonToKicadPcbConverter([
    ...board,
    { ...physicalVia, layers: ["inner2", "bottom"] },
    trace,
  ])
  converter.runUntilFinished()
  expect(converter.getOutput().vias).toHaveLength(2)
})

test("traces on the same connectivity group can share a physical via", () => {
  const converter = new CircuitJsonToKicadPcbConverter([
    ...board,
    {
      ...physicalVia,
      pcb_trace_id: "other_trace",
      subcircuit_connectivity_map_key: "connected",
    },
    {
      type: "source_trace",
      source_trace_id: "source1",
      connected_source_port_ids: [],
      connected_source_net_ids: [],
      subcircuit_connectivity_map_key: "connected",
    },
    { ...trace, source_trace_id: "source1" },
  ])
  converter.runUntilFinished()
  expect(converter.getOutput().vias).toHaveLength(1)
})

test("explicitly different route via dimensions are preserved", () => {
  const converter = new CircuitJsonToKicadPcbConverter([
    ...board,
    physicalVia,
    {
      ...trace,
      route: [
        {
          route_type: "via",
          x: 1,
          y: 2,
          from_layer: "top",
          to_layer: "bottom",
          outer_diameter: 0.9,
          hole_diameter: 0.4,
        },
      ],
    },
  ])
  converter.runUntilFinished()
  expect(converter.getOutput().vias).toHaveLength(2)
  expect(converter.getOutput().vias[1]!.size).toBe(0.9)
})

test("repeated route-only transitions export one via", () => {
  const converter = new CircuitJsonToKicadPcbConverter([
    ...board,
    { ...trace, route: [...trace.route, ...trace.route] },
  ])
  converter.runUntilFinished()
  expect(converter.getOutput().vias).toHaveLength(1)
})
