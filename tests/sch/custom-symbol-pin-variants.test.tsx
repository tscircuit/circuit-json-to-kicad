import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"
import { exportNativeSchematicNets } from "../fixtures/export-native-schematic-nets"

test("identical boxes keep different pin numbers and names", async () => {
  const pins = [
    { number: 1, label: "DATA" },
    { number: 2, label: "DATA" },
    { number: 1, label: "CLK" },
  ]
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board>
      {pins.map((pin, index) => (
        <group key={index}>
          <chip
            name={`U${index + 1}`}
            schY={-4 * index}
            symbol={
              <symbol name="Shared">
                <schematicrect width={2} height={2} />
                <port
                  name={pin.label}
                  pinNumber={pin.number}
                  direction="right"
                  schX={1}
                  schY={0}
                />
              </symbol>
            }
          />
          <resistor
            name={`R${index + 1}`}
            resistance="1k"
            schX={5}
            schY={-4 * index}
          />
          <trace
            from={`.U${index + 1} > .pin${pin.number}`}
            to={`.R${index + 1} > .pin1`}
          />
        </group>
      ))}
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const schematic = parseKicadSch(converter.getOutputString())
  const sharedSymbols = schematic.libSymbols!.symbols.filter((symbol) =>
    symbol.libraryId?.startsWith("Custom:Shared"),
  )
  expect(sharedSymbols).toHaveLength(3)
  expect(
    sharedSymbols.flatMap((symbol) =>
      symbol.subSymbols.flatMap((unit) =>
        unit.pins.map((pin) => ({
          number: Number(pin.numberString),
          label: pin.name,
        })),
      ),
    ),
  ).toEqual(pins)

  const nets = await exportNativeSchematicNets(circuitJson)
  for (const [index, pin] of pins.entries()) {
    expect(nets.map((net) => net.pins)).toContainEqual([
      `R${index + 1}.1`,
      `U${index + 1}.${pin.number}`,
    ])
  }
}, 30_000)
