import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"
import { exportNativeSchematicNets } from "../fixtures/export-native-schematic-nets"

const Example = () => (
  <board>
    <chip
      name="U1"
      schY={4}
      symbol={
        <symbol name="Shared">
          <schematicrect width={2} height={2} />
          <port name="DATA" pinNumber={1} direction="right" schX={1} schY={0} />
        </symbol>
      }
    />
    <resistor name="R1" resistance="1k" schX={5} schY={4} />
    <trace from=".U1 > .pin1" to=".R1 > .pin1" />

    <chip
      name="U2"
      schY={0}
      symbol={
        <symbol name="Shared">
          <schematicrect width={2} height={2} />
          <port name="DATA" pinNumber={2} direction="right" schX={1} schY={0} />
        </symbol>
      }
    />
    <resistor name="R2" resistance="1k" schX={5} schY={0} />
    <trace from=".U2 > .pin2" to=".R2 > .pin1" />

    <chip
      name="U3"
      schY={-4}
      symbol={
        <symbol name="Shared">
          <schematicrect width={2} height={2} />
          <port name="CLK" pinNumber={1} direction="right" schX={1} schY={0} />
        </symbol>
      }
    />
    <resistor name="R3" resistance="1k" schX={5} schY={-4} />
    <trace from=".U3 > .pin1" to=".R3 > .pin1" />
  </board>
)

export default Example

test("identical boxes keep different pin numbers and names", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(<Example />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const schematic = parseKicadSch(converter.getOutputString())
  const sharedSymbols = schematic.libSymbols!.symbols.filter((symbol) =>
    symbol.libraryId?.startsWith("Custom:Shared"),
  )
  expect(sharedSymbols).toHaveLength(3)
  const exportedPins = sharedSymbols.flatMap((symbol) =>
    symbol.subSymbols.flatMap((unit) => unit.pins),
  )
  expect(exportedPins.map((pin) => pin.numberString)).toEqual(["1", "2", "1"])
  expect(exportedPins.map((pin) => pin.name)).toEqual(["DATA", "DATA", "CLK"])

  const connections = (await exportNativeSchematicNets(circuitJson)).map(
    (net) => net.pins,
  )
  expect(connections).toContainEqual(["R1.1", "U1.1"])
  expect(connections).toContainEqual(["R2.1", "U2.2"])
  expect(connections).toContainEqual(["R3.1", "U3.1"])
}, 30_000)
