import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"

const MySymbol = () => (
  <symbol name="MyPart">
    <schematicpath
      points={[
        { x: -0.2, y: -0.07219 },
        { x: 0.2, y: -0.07219 },
      ]}
    />
    <port name="A" direction="left" schX={-0.3} schY={0} />
    <port name="B" direction="right" schX={0.3} schY={0} />
  </symbol>
)

test("reused custom symbol at different board positions shares one library symbol without rounding drift", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board>
      <chip name="U1" symbol={<MySymbol />} />
      <chip name="U2" schX={2.205} schY={-2.55} symbol={<MySymbol />} />
    </board>,
  )
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadSchConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const schematic = parseKicadSch(converter.getOutputString())

  const libSymbolIds = (schematic.libSymbols?.symbols ?? []).map(
    (sym) => sym.libraryId,
  )
  expect(libSymbolIds).toEqual(["Custom:MyPart"])

  const placedLibraryIds = schematic.symbols.map((sym) => sym.libraryId)
  expect(placedLibraryIds).toEqual(["Custom:MyPart", "Custom:MyPart"])
})
