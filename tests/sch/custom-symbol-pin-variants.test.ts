import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { customSymbolComponent } from "../fixtures/custom-symbol-circuit"
import { exportNativeSchematicNets } from "../fixtures/export-native-schematic-nets"

test("identical custom artwork preserves different pin numbers, names and positions", async () => {
  const pins = [
    { x: 1, y: 0, number: 1, label: "DATA" },
    { x: 1, y: 0, number: 2, label: "DATA" },
    { x: 1, y: 0, number: 1, label: "CLK" },
    { x: -1, y: 0, number: 1, label: "DATA" },
    { x: 0, y: 1, number: 1, label: "DATA" },
  ]
  const circuit: CircuitJson = pins.flatMap((pin, index) => {
    const y = index * 4
    return [
      ...customSymbolComponent({
        reference: `U${index + 1}`,
        center: { x: 0, y },
        pin,
      }),
      ...customSymbolComponent({
        reference: `J${index + 1}`,
        name: "Peer",
        center: { x: 4, y },
      }),
      {
        type: "schematic_trace",
        schematic_trace_id: `wire_${index}`,
        edges: [
          { from: { x: pin.x, y: y + pin.y }, to: { x: 5, y: y + pin.y } },
          { from: { x: 5, y: y + pin.y }, to: { x: 5, y } },
        ].filter(
          (edge) => edge.from.x !== edge.to.x || edge.from.y !== edge.to.y,
        ),
        junctions: [],
      },
    ]
  })
  const converter = new CircuitJsonToKicadSchConverter(circuit)
  converter.runUntilFinished()
  const schematic = parseKicadSch(converter.getOutputString())
  expect(
    schematic.libSymbols!.symbols.filter((symbol) =>
      symbol.libraryId?.startsWith("Custom:Shared"),
    ),
  ).toHaveLength(5)
  const nativeNets = await exportNativeSchematicNets(circuit)
  for (const [index, pin] of pins.entries()) {
    expect(nativeNets.map((net) => net.pins)).toContainEqual([
      `J${index + 1}.1`,
      `U${index + 1}.${pin.number}`,
    ])
  }
}, 30_000)
