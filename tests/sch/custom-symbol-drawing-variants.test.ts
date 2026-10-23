import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { customSymbolComponent } from "../fixtures/custom-symbol-circuit"

test("custom symbol sharing preserves artwork, fill and numeric text differences", () => {
  const variants = [
    { text: "1.00000001" },
    { text: "1.00000002" },
    { text: "1.00000001", filled: true },
    { text: "1.00000001", halfWidth: 2 },
    { text: "1.00000001" },
  ]
  const circuit = variants.flatMap((variant, index) =>
    customSymbolComponent({
      ...variant,
      reference: `U${index + 1}`,
      center: { x: 3.1 * index, y: 4.1 * index },
    }),
  )
  const converter = new CircuitJsonToKicadSchConverter(circuit)
  converter.runUntilFinished()
  const schematic = parseKicadSch(converter.getOutputString())
  const ids = schematic.symbols.map((symbol) => symbol.libraryId)
  expect(new Set(ids.slice(0, 4)).size).toBe(4)
  expect(ids[4]).toBe(ids[0])
  expect(schematic.libSymbols!.symbols).toHaveLength(4)
  expect(
    schematic.libSymbols!.symbols.flatMap((symbol) =>
      symbol.subSymbols.flatMap((unit) => unit.texts.map((text) => text.value)),
    ),
  ).toEqual(["1.00000001", "1.00000002", "1.00000001", "1.00000001"])
})
