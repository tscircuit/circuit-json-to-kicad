import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadLibraryConverter } from "lib/kicad-library/CircuitJsonToKicadLibraryConverter"

// The root schematic contains only sheet nodes. All three symbol definitions
// must be collected from the child schematics when exporting the library.
test("kicad library includes symbols placed on schematic sheets", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board routingDisabled>
      <schematicsheet name="Analog" displayName="Analog" sheetIndex={0} />
      <schematicsheet name="Digital" displayName="Digital" sheetIndex={1} />

      {/* Analog sheet: a resistor and a capacitor */}
      <resistor
        name="R1"
        resistance="10k"
        footprint="0402"
        schSheetName="Analog"
      />
      <capacitor
        name="C1"
        capacitance="100nF"
        footprint="0402"
        schSheetName="Analog"
      />

      {/* Digital sheet: a chip */}
      <chip name="U1" footprint="soic8" schSheetName="Digital" />
    </board>,
  )

  await circuit.renderUntilSettled()

  const libraryConverter = new CircuitJsonToKicadLibraryConverter(
    circuit.getCircuitJson() as any,
    {
      libraryName: "test_library",
      footprintLibraryName: "test_library",
    },
  )
  libraryConverter.runUntilFinished()

  const output = libraryConverter.getOutput()

  expect(output.symbols).toHaveLength(3)
  expect(output.kicadSymString).toContain('(symbol "')
})
