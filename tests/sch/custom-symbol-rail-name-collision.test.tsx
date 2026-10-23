import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"
import { exportNativeSchematicNets } from "../fixtures/export-native-schematic-nets"

test("a custom component named rail_up cannot replace the power rail library symbol", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board>
      <net name="VDD" isPowerNet />
      <capacitor
        name="C1"
        capacitance="100nF"
        schX={-3}
        connections={{ pin1: "net.VDD" }}
      />
      <capacitor
        name="C2"
        capacitance="100nF"
        schX={3}
        connections={{ pin1: "net.VDD" }}
      />
      <chip
        name="U1"
        schY={-4}
        symbol={
          <symbol name="rail_up">
            <schematicrect width={2} height={1} />
            <port name="1" pinNumber={1} direction="right" schX={1} schY={0} />
          </symbol>
        }
      />
      <resistor name="R1" resistance="1k" schX={4} schY={-4} />
      <trace from=".U1 > .pin1" to=".R1 > .pin1" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
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
  expect(nets.map((net) => net.pins)).toContainEqual(["R1.1", "U1.1"])
}, 30_000)
