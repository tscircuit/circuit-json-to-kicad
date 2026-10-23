import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"
import { customSymbolComponent } from "../fixtures/custom-symbol-circuit"
import { exportNativeSchematicNets } from "../fixtures/export-native-schematic-nets"

test("a custom component named rail_up cannot replace the power rail library symbol", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm" routingDisabled>
      <net name="VDD" isPowerNet />
      <capacitor
        name="C1"
        capacitance="100nF"
        footprint="0402"
        schX={-3}
        pcbX={-3}
        connections={{ pin1: "net.VDD" }}
      />
      <capacitor
        name="C2"
        capacitance="100nF"
        footprint="0402"
        schX={3}
        pcbX={3}
        connections={{ pin1: "net.VDD" }}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = [
    ...circuit.getCircuitJson(),
    ...customSymbolComponent({
      reference: "U1",
      name: "rail_up",
      center: { x: 0, y: -4 },
    }),
  ]
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const schematic = parseKicadSch(converter.getOutputString())
  const component = schematic.symbols.find((symbol) =>
    symbol.properties.some(
      (property) => property.key === "Reference" && property.value === "U1",
    ),
  )!
  expect(component.libraryId).not.toBe("Custom:rail_up")
  const libraries = schematic.libSymbols!.symbols
  expect(new Set(libraries.map((symbol) => symbol.libraryId)).size).toBe(
    libraries.length,
  )
  const rail = libraries.find(
    (symbol) => symbol.libraryId === "Custom:rail_up",
  )!
  expect(
    rail.subSymbols
      .flatMap((unit) => unit.pins)
      .every((pin) => pin.pinElectricalType === "power_in"),
  ).toBe(true)
  const nets = await exportNativeSchematicNets(circuitJson)
  expect(nets).toContainEqual({ name: "VDD", pins: ["C1.1", "C2.1"] })
  expect(nets.map((net) => net.pins)).toContainEqual(["U1.1"])
}, 30_000)
