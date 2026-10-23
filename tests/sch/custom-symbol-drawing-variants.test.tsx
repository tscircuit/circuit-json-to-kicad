import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"

test("same-name symbols share only when their artwork and text match", async () => {
  const drawings = [
    { text: "1.00000001", width: 2, filled: false },
    { text: "1.00000002", width: 2, filled: false },
    { text: "1.00000001", width: 2, filled: true },
    { text: "1.00000001", width: 4, filled: false },
    { text: "1.00000001", width: 2, filled: false },
  ]
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board>
      {drawings.map(({ text, width, filled }, index) => (
        <chip
          key={index}
          name={`U${index + 1}`}
          schX={3.1 * index}
          schY={4.1 * index}
          symbol={
            <symbol name="Shared">
              <schematicrect width={width} height={1} isFilled={filled} />
              <schematictext text={text} fontSize={0.1} anchor="center" />
              <port
                name="1"
                pinNumber={1}
                direction="right"
                schX={1}
                schY={0}
              />
            </symbol>
          }
        />
      ))}
    </board>,
  )
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadSchConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const schematic = parseKicadSch(converter.getOutputString())
  const ids = schematic.symbols.map((symbol) => symbol.libraryId)

  expect(new Set(ids.slice(0, 4)).size).toBe(4)
  expect(ids[4]).toBe(ids[0]) // The last drawing is an exact copy of the first.
  expect(schematic.libSymbols!.symbols).toHaveLength(4)
  // Numeric-looking text is content; it must never be rounded like coordinates.
  expect(
    schematic.libSymbols!.symbols.flatMap((symbol) =>
      symbol.subSymbols.flatMap((unit) => unit.texts.map((text) => text.value)),
    ),
  ).toEqual(["1.00000001", "1.00000002", "1.00000001", "1.00000001"])
})
