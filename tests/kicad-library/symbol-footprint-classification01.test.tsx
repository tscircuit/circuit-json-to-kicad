import { test, expect } from "bun:test"
import { KicadLibraryConverter } from "lib/kicad-library/KicadLibraryConverter"
import { Circuit } from "tscircuit"
import type { CircuitJson } from "circuit-json"
import path from "path"

const stepFilePath = path.resolve(
  __dirname,
  "../assets/SW_Push_1P1T_NO_CK_KMR2.step",
)

/**
 * A board with mixed builtin and custom footprints:
 * - R1: resistor with builtin 0402 footprint
 * - C1: capacitor with builtin 0603 footprint
 * - U1: chip with custom footprint and custom 3D model
 *
 * The bug: ClassifyKicadSymbolsStage used to pick the FIRST builtin symbol
 * (e.g. resistor) for the user library instead of matching the symbol whose
 * Footprint property references the custom footprint.
 */
async function renderMixedBoard(): Promise<CircuitJson> {
  const circuit = new Circuit()
  circuit.add(
    <board width="30mm" height="20mm">
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-5} />
      <capacitor name="C1" capacitance="100nF" footprint="0603" pcbX={5} />
      <chip
        name="U1"
        footprint={
          <footprint>
            <smtpad
              shape="rect"
              width="0.6mm"
              height="1.8mm"
              portHints={["pin1"]}
              pcbX={-1.25}
              pcbY={-0.95}
            />
            <smtpad
              shape="rect"
              width="0.6mm"
              height="1.8mm"
              portHints={["pin2"]}
              pcbX={-1.25}
              pcbY={0.95}
            />
            <smtpad
              shape="rect"
              width="0.6mm"
              height="1.8mm"
              portHints={["pin3"]}
              pcbX={1.25}
              pcbY={0.95}
            />
            <smtpad
              shape="rect"
              width="0.6mm"
              height="1.8mm"
              portHints={["pin4"]}
              pcbX={1.25}
              pcbY={-0.95}
            />
          </footprint>
        }
        cadModel={{
          stepUrl: stepFilePath,
          rotationOffset: { x: 0, y: 0, z: 0 },
        }}
        pinLabels={{ pin1: "VCC", pin2: "GND", pin3: "OUT", pin4: "IN" }}
        pcbY={5}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson() as CircuitJson
}

test("symbol-footprint classification: correct symbol assigned to user library with mixed builtin/custom footprints", async () => {
  const circuitJson = await renderMixedBoard()

  const converter = new KicadLibraryConverter({
    kicadLibraryName: "test-lib",
    entrypoint: "lib/index.ts",
    getExportsFromTsxFile: async () => ["MixedBoard"],
    buildFileToCircuitJson: async () => circuitJson,
    includeBuiltins: true,
  })

  await converter.run()
  const output = converter.getOutput()

  // 1. Verify file structure: user footprint for chip, builtin footprints for R/C
  const outputKeys = Object.keys(output.kicadProjectFsMap).sort()
  expect(outputKeys).toContain(
    "footprints/test-lib.pretty/MixedBoard.kicad_mod",
  )
  expect(outputKeys).toContain(
    "footprints/tscircuit_builtin.pretty/resistor_0402.kicad_mod",
  )
  expect(outputKeys).toContain(
    "footprints/tscircuit_builtin.pretty/capacitor_0603.kicad_mod",
  )

  // 2. Verify both user and builtin symbol libraries exist
  expect(outputKeys).toContain("symbols/test-lib.kicad_sym")
  expect(outputKeys).toContain("symbols/tscircuit_builtin.kicad_sym")

  // 3. The user symbol should be the chip (for U1), NOT the resistor or capacitor
  const userSymbolContent = output.kicadProjectFsMap[
    "symbols/test-lib.kicad_sym"
  ] as string
  expect(userSymbolContent).toBeDefined()

  // The user symbol must reference the user footprint "test-lib:MixedBoard"
  expect(userSymbolContent).toContain('"Footprint" "test-lib:MixedBoard"')

  // The user symbol should NOT be a resistor or capacitor
  // Resistor symbols have Reference "R", capacitor symbols have Reference "C"
  // The chip symbol should have Reference "U"
  expect(userSymbolContent).not.toMatch(/\(property "Reference" "R"\s/)
  expect(userSymbolContent).not.toMatch(/\(property "Reference" "C"\s/)

  // The user symbol should have 4 pins (matching U1's 4-pin custom footprint)
  const userPinCount = (userSymbolContent.match(/\(pin /g) || []).length
  expect(userPinCount).toBe(4)

  // 4. Builtin symbols should reference builtin footprints
  const builtinSymbolContent = output.kicadProjectFsMap[
    "symbols/tscircuit_builtin.kicad_sym"
  ] as string
  expect(builtinSymbolContent).toBeDefined()

  expect(builtinSymbolContent).toContain(
    '"Footprint" "tscircuit_builtin:resistor_0402"',
  )
  expect(builtinSymbolContent).toContain(
    '"Footprint" "tscircuit_builtin:capacitor_0603"',
  )

  // Builtin symbols should NOT reference user footprints
  expect(builtinSymbolContent).not.toContain("test-lib:")

  // 5. Library tables should include both user and builtin entries
  const fpLibTable = output.kicadProjectFsMap["fp-lib-table"] as string
  expect(fpLibTable).toContain('(name "test-lib")')
  expect(fpLibTable).toContain('(name "tscircuit_builtin")')

  const symLibTable = output.kicadProjectFsMap["sym-lib-table"] as string
  expect(symLibTable).toContain('(name "test-lib")')
  expect(symLibTable).toContain('(name "tscircuit_builtin")')
})
