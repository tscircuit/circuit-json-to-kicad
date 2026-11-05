import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { KicadSymbolLib, parseKicadSexpr } from "kicadts"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadLibraryConverter } from "lib/kicad-library/CircuitJsonToKicadLibraryConverter"

test("exports root and child symbols together without duplicating shared symbols or merging custom artwork", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board routingDisabled>
      <resistor name="RROOT" resistance="10k" footprint="0402" />
      <schematicsheet name="Empty" displayName="Empty" sheetIndex={0} />
      <schematicsheet name="Analog" displayName="Analog" sheetIndex={1} />
      <schematicsheet name="Digital" displayName="Digital" sheetIndex={2} />
      <resistor
        name="R1"
        resistance="10k"
        footprint="0402"
        schSheetName="Analog"
      />
      <resistor
        name="R2"
        resistance="10k"
        footprint="0402"
        schSheetName="Digital"
      />
      <capacitor
        name="C1"
        capacitance="100nF"
        footprint="0402"
        schSheetName="Analog"
      />
      <chip
        name="U1"
        footprint="soic8"
        schSheetName="Analog"
        symbol={
          <symbol name="AnalogBuffer">
            <schematicpath
              points={[
                { x: -1, y: -0.5 },
                { x: 1, y: 0 },
                { x: -1, y: 0.5 },
                { x: -1, y: -0.5 },
              ]}
            />
            <port
              name="pin1"
              pinNumber={1}
              direction="right"
              schX={1.23}
              schY={0.17}
            />
          </symbol>
        }
      />
      <chip
        name="U2"
        footprint="soic8"
        schSheetName="Digital"
        symbol={
          <symbol name="DigitalBuffer">
            <schematicpath
              points={[
                { x: -1, y: -0.5 },
                { x: 1, y: -0.5 },
                { x: 1, y: 0.5 },
                { x: -1, y: 0.5 },
                { x: -1, y: -0.5 },
              ]}
            />
            <port
              name="pin1"
              pinNumber={1}
              direction="right"
              schX={1.23}
              schY={0.17}
            />
          </symbol>
        }
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const hierarchical = circuit.getCircuitJson() as CircuitJson
  const flat = structuredClone(hierarchical).filter(
    (element) => element.type !== "schematic_sheet",
  )
  for (const element of flat) {
    if ("schematic_sheet_id" in element) delete element.schematic_sheet_id
  }
  const convert = (circuitJson: CircuitJson) => {
    const converter = new CircuitJsonToKicadLibraryConverter(circuitJson, {
      libraryName: "sheet_symbols",
      footprintLibraryName: "sheet_footprints",
    })
    converter.runUntilFinished()
    return converter.getOutput()
  }
  const baseline = convert(flat)
  expect(baseline.symbols).toHaveLength(4)
  expect(baseline.symbols.filter((symbol) => symbol.isBuiltin)).toHaveLength(2)
  const output = convert(hierarchical)
  expect(output.symbols.map((symbol) => symbol.symbolName).sort()).toEqual(
    baseline.symbols.map((symbol) => symbol.symbolName).sort(),
  )
  for (const entry of output.symbols) {
    const expected = baseline.symbols.find(
      (symbol) => symbol.symbolName === entry.symbolName,
    )!
    // Compare the complete extracted definition: custom coordinates, snapped
    // builtin pins, and rewritten footprint links all retain flat-export behavior.
    expect(entry.isBuiltin).toBe(expected.isBuiltin)
    expect(entry.symbol.getString()).toBe(expected.symbol.getString())
  }
  expect(output.footprints).toEqual(baseline.footprints)
  const library = parseKicadSexpr(output.kicadSymString).find(
    (node) => node instanceof KicadSymbolLib,
  )!
  expect(library.symbols).toHaveLength(4)
})
