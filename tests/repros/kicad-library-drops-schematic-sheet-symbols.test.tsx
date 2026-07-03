import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadLibraryConverter } from "lib/kicad-library/CircuitJsonToKicadLibraryConverter"

/**
 * Known bug: the KiCad symbol-library (`.kicad_sym`) drops every component that
 * is placed on a `<schematicsheet>`.
 *
 * The library is extracted from the schematic converter's output, which for a
 * hierarchical design is the ROOT `.kicad_sch`. Its `lib_symbols` only holds
 * root-level components — everything placed on a sheet lives in a child
 * `.kicad_sch`, so it never reaches the library.
 *
 * Marked `test.failing` because it asserts the CORRECT behavior (the library
 * should contain the sheet symbols), which the current code does not satisfy.
 * The fix is to union `lib_symbols` across all sheet files; remove `.failing`
 * once it lands.
 */
test.failing("kicad library drops symbols placed on schematic sheets", async () => {
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

  // The library should contain a `(symbol ...)` for the resistor, capacitor,
  // and chip used on the sheets. Today it is empty, so this fails.
  expect(output.kicadSymString).toContain('(symbol "')
})
