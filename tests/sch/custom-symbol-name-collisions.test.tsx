import { expect, test } from "bun:test"
import { parseKicadSch, SymbolRectangleEnd } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"

const Box = ({ name, width }: { name: string; width: number }) => (
  <symbol name={name}>
    <schematicrect width={width} height={1} />
    <port name="1" pinNumber={1} direction="right" schX={width / 2} schY={0} />
  </symbol>
)

const Example = () => (
  <board>
    <chip name="U1" schY={3} symbol={<Box name="Shared" width={2} />} />
    <chip name="U2" schY={0} symbol={<Box name="Shared" width={4} />} />
    <chip name="U3" schY={-3} symbol={<Box name="Shared_2" width={6} />} />
  </board>
)

export default Example

test("a generated variant ID cannot take the name of Shared_2", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(<Example />)
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadSchConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const schematic = parseKicadSch(converter.getOutputString())

  // U2 must skip the name explicitly used by U3, even though U3 comes later.
  expect(schematic.symbols.map((symbol) => symbol.libraryId)).toEqual([
    "Custom:Shared",
    "Custom:Shared_3",
    "Custom:Shared_2",
  ])
  const rightEdges = schematic.libSymbols!.symbols.map(
    (symbol) =>
      symbol.subSymbols
        .flatMap((unit) => unit.rectangles)[0]!
        .getChildren()
        .find((child) => child instanceof SymbolRectangleEnd)!.x,
  )
  expect(rightEdges).toEqual([15, 30, 45])
})
