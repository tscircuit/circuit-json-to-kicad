import { expect, test } from "bun:test"
import { parseKicadSch, SymbolRectangleEnd } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"

// A generated suffix must not take the name of a different source symbol.
const boxes = [
  { name: "Shared", width: 2 },
  { name: "Shared", width: 4 },
  { name: "Shared_2", width: 6 },
]

test("same-name variants preserve an explicitly named Shared_2 in either order", async () => {
  for (const order of [boxes, [...boxes].reverse()]) {
    const circuit = new Circuit()
    circuit.pcbDisabled = true
    circuit.add(
      <board>
        {order.map(({ name, width }, index) => (
          <chip
            key={index}
            name={`U${index + 1}`}
            schY={-3 * index}
            symbol={
              <symbol name={name}>
                <schematicrect width={width} height={1} />
                <port
                  name="1"
                  pinNumber={1}
                  direction="right"
                  schX={width / 2}
                  schY={0}
                />
              </symbol>
            }
          />
        ))}
      </board>,
    )
    await circuit.renderUntilSettled()
    const converter = new CircuitJsonToKicadSchConverter(
      circuit.getCircuitJson(),
    )
    converter.runUntilFinished()
    const schematic = parseKicadSch(converter.getOutputString())
    const libraries = schematic.libSymbols!.symbols
    expect(new Set(libraries.map((symbol) => symbol.libraryId)).size).toBe(3)

    // Each placed component must still use its own rectangle, regardless of ID.
    for (const [index, instance] of schematic.symbols.entries()) {
      if (order[index]!.name === "Shared_2") {
        expect(instance.libraryId).toBe("Custom:Shared_2")
      }
      const library = libraries.find(
        (symbol) => symbol.libraryId === instance.libraryId,
      )!
      const rectangle = library.subSymbols.flatMap(
        (unit) => unit.rectangles,
      )[0]!
      const rightEdge = rectangle
        .getChildren()
        .find((child) => child instanceof SymbolRectangleEnd)!.x
      expect(rightEdge).toBe((order[index]!.width / 2) * 15)
    }
  }
})
