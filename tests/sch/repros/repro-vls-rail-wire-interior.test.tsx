import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"
import { exportNativeSchematicNets } from "../../fixtures/export-native-schematic-nets"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

async function fixture() {
  const circuit = new Circuit()
  circuit.add(
    <board routingDisabled>
      <resistor
        name="R16"
        resistance="316"
        footprint="0402"
        schX={0}
        schY={0}
        schRotation={90}
      />
      <resistor
        name="R17"
        resistance="316"
        footprint="0402"
        schX={2}
        schY={0}
        schRotation={90}
      />
      <resistor
        name="R18"
        resistance="1k"
        footprint="0402"
        schX={5}
        schY={0}
        schRotation={90}
      />
      <net name="VLS" />
      <trace from=".R16 > .pin2" to="net.VLS" />
      <trace from=".R17 > .pin2" to="net.VLS" />
      <trace from=".R18 > .pin2" to="net.VLS" />
    </board>,
  )
  await circuit.renderUntilSettled()
  // Freeze the same geometry as open-ring-flex: a rail pin on the interior
  // of one continuous horizontal edge. Do not rely on autorouter heuristics.
  const data = circuit
    .getCircuitJson()
    .filter(
      (e) =>
        !["schematic_trace", "schematic_net_label", "schematic_text"].includes(
          e.type,
        ),
    )
  const port = (name: string) => {
    const source = data.find(
      (e) => e.type === "source_component" && e.name === name,
    )!
    const p = data.find(
      (e) =>
        e.type === "source_port" &&
        e.source_component_id === (source as any).source_component_id &&
        e.pin_number === 2,
    )!
    return (
      data.find(
        (e) =>
          e.type === "schematic_port" &&
          e.source_port_id === (p as any).source_port_id,
      ) as any
    ).center
  }
  const a = port("R16"),
    b = port("R17"),
    c = port("R18")
  const y = Math.max(a.y, b.y) + 0.5
  const anchor = { x: (a.x + b.x) / 2, y }
  const net = data.find(
    (e) => e.type === "source_net" && e.name === "VLS",
  ) as any
  data.push(
    ...([
      {
        type: "schematic_trace",
        schematic_trace_id: "vls-pair",
        source_trace_id: "vls-pair",
        edges: [
          { from: a, to: { x: a.x, y } },
          { from: { x: a.x, y }, to: { x: b.x, y } },
          { from: { x: b.x, y }, to: b },
        ],
        junctions: [],
      },
      {
        type: "schematic_net_label",
        schematic_net_label_id: "vls-midpoint",
        text: "VLS",
        source_net_id: net.source_net_id,
        anchor_position: anchor,
        center: { x: anchor.x, y: y + 0.09 },
        anchor_side: "bottom",
        symbol_name: "rail_up",
      },
      {
        type: "schematic_net_label",
        schematic_net_label_id: "vls-remote",
        text: "VLS",
        source_net_id: net.source_net_id,
        anchor_position: c,
        center: { x: c.x, y: c.y + 0.09 },
        anchor_side: "bottom",
        symbol_name: "rail_up",
      },
    ] as any),
  )
  return { data, anchor }
}

test("repro: VLS rail on wire interior schematic snapshot", async () => {
  const { data } = await fixture()
  const converter = new CircuitJsonToKicadSchConverter(data)
  converter.runUntilFinished()
  const snapshot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "sch",
  })
  expect(snapshot.exitCode).toBe(0)
  await expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({
        circuitJson: data,
        outputType: "schematic",
      }),
      snapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 30_000)

test.failing("repro: VLS rail on wire interior must connect R16/R17 to remote VLS", async () => {
  const { data } = await fixture()
  const nets = await exportNativeSchematicNets(data)
  expect(nets.find((net) => net.name === "VLS")?.pins).toEqual([
    "R16.2",
    "R17.2",
    "R18.2",
  ])
}, 30_000)

test("repro control: splitting the wire at the same rail anchor connects VLS", async () => {
  const { data, anchor } = await fixture()
  const trace = data.find(
    (e) => e.type === "schematic_trace" && e.schematic_trace_id === "vls-pair",
  ) as any
  const edge = trace.edges[1]
  trace.edges.splice(
    1,
    1,
    { from: edge.from, to: anchor },
    { from: anchor, to: edge.to },
  )
  const nets = await exportNativeSchematicNets(data)
  expect(nets.find((net) => net.name === "VLS")?.pins).toEqual([
    "R16.2",
    "R17.2",
    "R18.2",
  ])
}, 30_000)
