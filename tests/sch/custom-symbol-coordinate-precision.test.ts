import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { customSymbolComponent } from "../fixtures/custom-symbol-circuit"
import { exportNativeSchematicNets } from "../fixtures/export-native-schematic-nets"

test("fractional custom pin offsets connect on all sides without merging adjacent KiCad coordinates", async () => {
  const pins = [
    { x: 2 / 7, y: 0 },
    // Exactly one schematic internal unit further along the sheet at scale 15.
    { x: 2 / 7 + 0.0001 / 15, y: 0 },
    { x: -2 / 7, y: 0 },
    { x: 0, y: 2 / 7 },
    { x: 0, y: -2 / 7 },
    // Endpoints on a half-unit boundary: translating local offsets back to
    // the sheet can land on the other side of the rounding boundary.
    { x: 1 + 0.5 / 150_000, y: 0, centerX: 1.3 },
    { x: 1.00011, y: 0, centerX: 1.3 },
    { x: 1.0001166666666668, y: 0, centerX: 3.1 },
  ]
  const circuit: CircuitJson = pins.flatMap((offset, index) => {
    const center = { x: offset.centerX ?? 0.1234567, y: -3.1234567 * index }
    const start = { x: center.x + offset.x, y: center.y + offset.y }
    const end = { x: 5, y: center.y }
    return [
      ...customSymbolComponent({
        reference: `U${index + 1}`,
        center,
        pin: { ...offset, number: 1, label: "1" },
      }),
      ...customSymbolComponent({
        reference: `J${index + 1}`,
        name: "Peer",
        center: { x: 4, y: center.y },
      }),
      {
        type: "schematic_trace",
        schematic_trace_id: `wire_${index}`,
        edges: [
          { from: start, to: { x: end.x, y: start.y } },
          ...(start.y === end.y
            ? []
            : [{ from: { x: end.x, y: start.y }, to: end }]),
        ],
        junctions: [],
      },
    ]
  })
  const options = { schematicSheets: [{ circuitOrigin: { x: 100, y: 100 } }] }
  const converter = new CircuitJsonToKicadSchConverter(circuit, options)
  converter.runUntilFinished()
  const schematic = parseKicadSch(converter.getOutputString())
  const componentIds = schematic.symbols
    .filter((symbol) =>
      symbol.properties.some(
        (property) =>
          property.key === "Reference" && property.value.startsWith("U"),
      ),
    )
    .map((symbol) => symbol.libraryId)
  expect(new Set(componentIds.slice(0, 5)).size).toBe(5)
  const nativeNets = await exportNativeSchematicNets(circuit, options)
  expect(nativeNets.map((net) => net.pins).sort()).toEqual(
    pins.map((_, index) => [`J${index + 1}.1`, `U${index + 1}.1`]),
  )
}, 30_000)
