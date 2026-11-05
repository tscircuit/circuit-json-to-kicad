import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"

test("splits schematic wire at interior netlabel anchor so midpoint power rail / global label connects", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board>
      <resistor
        name="R16"
        resistance="316"
        schX={0}
        schY={0}
        schRotation={90}
      />
      <resistor
        name="R17"
        resistance="316"
        schX={2}
        schY={0}
        schRotation={90}
      />
      <resistor name="R18" resistance="1k" schX={5} schY={0} schRotation={90} />
      <net name="VLS" isPowerNet />
      <trace from=".R16 > .pin2" to=".R17 > .pin2" />
      <netlabel net="VLS" anchorSide="bottom" schX={1} schY={0.5} />
      <netlabel net="VLS" connectsTo=".R18 > .pin2" schX={5} schY={1} />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadSchConverter(
    circuitJson as CircuitJson,
  )
  converter.runUntilFinished()
  const kicadSch = converter.getOutput()
  const wires = kicadSch.wires ?? []

  // Midpoint VLS rail is at schX=1, schY=0.5 (which lies on the horizontal trace between R16.pin2 and R17.pin2)
  // Verify that two wire segments meet at the midpoint rail's X coordinate instead of a single unsplit wire spanning across it
  const vlsSymbols = (kicadSch.symbols ?? []).filter((sym) =>
    sym.properties.some((p) => p.key === "Value" && p.value === "VLS"),
  )
  expect(vlsSymbols.length).toBe(2)
  const symAt = vlsSymbols[0]!.at as any
  const midpointVlsX = Array.isArray(symAt) ? symAt[0] : symAt.x
  const matchingWireEndpointsAtMidpoint = wires.filter((w) =>
    (w.points?.points ?? []).some(
      (pt: any) => Math.abs(pt.x - midpointVlsX) < 1e-3,
    ),
  )
  expect(matchingWireEndpointsAtMidpoint.length).toBe(2)

  // Also test with an explicit power rail symbol_name on a continuous horizontal wire
  const syntheticCircuit: CircuitJson = [
    {
      type: "schematic_trace",
      schematic_trace_id: "trace_1",
      source_trace_id: "src_trace_1",
      edges: [
        {
          from: { x: 0, y: 1 },
          to: { x: 4, y: 1 },
        },
      ],
      junctions: [],
    },
    {
      type: "schematic_net_label",
      schematic_net_label_id: "nl_mid",
      source_net_id: "net_vls",
      text: "VLS",
      symbol_name: "rail_up",
      anchor_position: { x: 2, y: 1 },
      center: { x: 2, y: 1.2 },
      anchor_side: "bottom",
    },
  ]

  const syntheticConverter = new CircuitJsonToKicadSchConverter(
    syntheticCircuit,
  )
  syntheticConverter.runUntilFinished()
  const syntheticSch = syntheticConverter.getOutput()
  const syntheticWires = syntheticSch.wires ?? []
  const railSymbol = syntheticSch.symbols?.[0]

  expect(syntheticWires).toHaveLength(2)
  expect(railSymbol).toBeDefined()

  const firstWireEnd = (syntheticWires[0]!.points?.points?.[1] as any)!
  const secondWireStart = (syntheticWires[1]!.points?.points?.[0] as any)!

  expect(firstWireEnd.x).toBeCloseTo(secondWireStart.x, 5)
  expect(firstWireEnd.y).toBeCloseTo(secondWireStart.y, 5)
})
