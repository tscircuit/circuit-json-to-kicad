import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"

const Box = ({
  text,
  width = 2,
  filled = false,
}: {
  text: string
  width?: number
  filled?: boolean
}) => (
  <symbol name="Shared">
    <schematicrect width={width} height={1} isFilled={filled} />
    <schematictext text={text} fontSize={0.1} anchor="center" />
    <port name="1" pinNumber={1} direction="right" schX={1} schY={0} />
  </symbol>
)

const Example = () => (
  <board>
    <chip name="U1" schY={0} symbol={<Box text="3.30001V" />} />
    <chip name="U2" schY={3.1} symbol={<Box text="3.30002V" />} />
    <chip name="U3" schY={6.2} symbol={<Box text="3.30001V" filled />} />
    <chip name="U4" schY={9.3} symbol={<Box text="3.30001V" width={4} />} />
    <chip name="U5" schY={12.4} symbol={<Box text="3.30001V" />} />
  </board>
)

export default Example

test("same-name symbols share only when their artwork and text match", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(<Example />)
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadSchConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const schematic = parseKicadSch(converter.getOutputString())
  expect(schematic.symbols.map((symbol) => symbol.libraryId)).toEqual([
    "Custom:Shared",
    "Custom:Shared_2",
    "Custom:Shared_3",
    "Custom:Shared_4",
    "Custom:Shared", // U5 repeats U1's drawing at a different position.
  ])
  expect(schematic.libSymbols!.symbols).toHaveLength(4)

  // Text must stay exact, even when its numbers differ by less than a coordinate step.
  const texts = schematic.libSymbols!.symbols.flatMap((symbol) =>
    symbol.subSymbols.flatMap((unit) => unit.texts.map((text) => text.value)),
  )
  expect(texts).toEqual(["3.30001V", "3.30002V", "3.30001V", "3.30001V"])
})

test("identical custom symbols placed off-origin share one library symbol at half-unit rounding boundaries", async () => {
  const MySymbol = () => (
    <symbol name="MyPart">
      <schematicpath
        strokeWidth={0.05}
        points={[
          { x: -0.374283, y: -0.07219 },
          { x: 0.374283, y: -0.07219 },
          { x: 0.374283, y: 0.07219 },
          { x: -0.374283, y: 0.07219 },
          { x: -0.374283, y: -0.07219 },
        ]}
      />
      <port name="1" pinNumber={1} direction="right" schX={0.374283} schY={0} />
    </symbol>
  )

  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board width="20mm" height="10mm">
      <chip
        name="U1"
        footprint="0402"
        symbol={<MySymbol />}
        pcbX={-3}
        schX={0}
        schY={0}
      />
      <chip
        name="U2"
        footprint="0402"
        symbol={<MySymbol />}
        pcbX={3}
        schX={2.205}
        schY={-2.55}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadSchConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const schematic = parseKicadSch(converter.getOutputString())

  expect(schematic.symbols.map((symbol) => symbol.libraryId)).toEqual([
    "Custom:MyPart",
    "Custom:MyPart",
  ])
  expect(
    schematic.libSymbols!.symbols.map((symbol) => symbol.libraryId),
  ).toEqual(["Custom:MyPart"])
})
