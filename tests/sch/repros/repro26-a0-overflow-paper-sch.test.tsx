import { expect, test } from "bun:test"
import { Circuit } from "tscircuit-latest"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { selectSchematicPaperSize } from "lib/schematic/selectSchematicPaperSize"

test("repro26: overflowing schematics fit portrait or custom sheets", async () => {
  expect(selectSchematicPaperSize(800, 1100)).toEqual({
    name: "A0",
    width: 841,
    height: 1189,
    isPortrait: true,
  })
  expect(selectSchematicPaperSize(2000, 1500).customSize).toEqual({
    width: 2040,
    height: 1540,
  })
  expect(selectSchematicPaperSize(100, 100)).toEqual({
    name: "A4",
    width: 297,
    height: 210,
  })

  // Check final serialized coordinates, including visible field anchors,
  // for both the portrait fallback and custom sheets in either orientation.
  for (const [x, y, expectedSize] of [
    [0, -58, "A0"],
    [100, -20, "custom"],
    [20, -100, "custom"],
  ] as const) {
    const circuit = new Circuit()
    circuit.pcbDisabled = true
    circuit.add(
      <board>
        <resistor
          name="R1"
          resistance="10k"
          symbolName="boxresistor"
          schX={0}
          schY={0}
        />
        <resistor
          name="R2"
          resistance="10k"
          symbolName="boxresistor"
          schX={x}
          schY={y}
        />
      </board>,
    )
    await circuit.renderUntilSettled()
    const converter = new CircuitJsonToKicadSchConverter(
      circuit.getCircuitJson(),
    )
    converter.runUntilFinished()
    const schematic = parseKicadSch(converter.getOutputString())
    const paper = schematic.paper!
    let width: number
    let height: number
    if (expectedSize === "A0") {
      expect(paper.size).toBe("A0")
      expect(paper.isPortrait).toBe(true)
      width = 841
      height = 1189
    } else {
      expect(paper.customSize).toBeDefined()
      expect(paper.isPortrait).toBe(false)
      width = paper.customSize!.width
      height = paper.customSize!.height
    }
    expect(schematic.symbols).toHaveLength(2)
    for (const symbol of schematic.symbols) {
      // These small resistor bodies/pins extend less than 10 mm from origin.
      // Require that clearance as well as checking exported text anchors.
      expect(symbol.at!.x).toBeGreaterThan(10)
      expect(symbol.at!.x).toBeLessThan(width - 10)
      expect(symbol.at!.y).toBeGreaterThan(10)
      expect(symbol.at!.y).toBeLessThan(height - 10)
      for (const property of symbol.properties.filter(
        (p) => p.key === "Reference" || p.key === "Value",
      )) {
        expect(property.at!.x).toBeGreaterThan(0)
        expect(property.at!.x).toBeLessThan(width)
        expect(property.at!.y).toBeGreaterThan(0)
        expect(property.at!.y).toBeLessThan(height)
      }
    }
  }
})
