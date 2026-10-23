import { expect, test } from "bun:test"
import { parseKicadSch, SymbolRectangleEnd } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { customSymbolComponent } from "../fixtures/custom-symbol-circuit"
import { exportNativeSchematicNets } from "../fixtures/export-native-schematic-nets"

test("custom symbol variants cannot take another source symbol's library ID", async () => {
  // The explicitly named Shared_2 follows the unnamed second variant, so an
  // allocator that checks only previously emitted definitions will collide.
  const components = [
    { name: "Shared", halfWidth: 1 },
    { name: "Shared", halfWidth: 2 },
    { name: "Shared_2", halfWidth: 3 },
    { name: "Shared", halfWidth: 2 },
  ]
  for (const order of [components, [...components].reverse()]) {
    const circuit = order.flatMap((component, index) =>
      customSymbolComponent({
        ...component,
        reference: `U${index + 1}`,
        center: { x: 0, y: index * 3 },
        pin: { x: component.halfWidth, y: 0, number: index + 1, label: "1" },
      }),
    )
    const converter = new CircuitJsonToKicadSchConverter(circuit)
    converter.runUntilFinished()
    const schematic = parseKicadSch(converter.getOutputString())
    const libraries = schematic.libSymbols!.symbols
    expect(new Set(libraries.map((symbol) => symbol.libraryId)).size).toBe(4)
    for (const [index, instance] of schematic.symbols.entries()) {
      const library = libraries.find(
        (symbol) => symbol.libraryId === instance.libraryId,
      )!
      expect(
        library.subSymbols
          .flatMap((unit) => unit.pins)
          .map((pin) => pin.numberString),
      ).toEqual([String(index + 1)])
      expect(
        library.subSymbols
          .flatMap((unit) => unit.rectangles)[0]!
          .getChildren()
          .find((child) => child instanceof SymbolRectangleEnd)?.x,
      ).toBe(order[index]!.halfWidth * 15)
    }
    const nativeNets = await exportNativeSchematicNets(circuit)
    expect(nativeNets.flatMap((net) => net.pins).sort()).toEqual([
      "U1.1",
      "U2.2",
      "U3.3",
      "U4.4",
    ])
  }
}, 30_000)
