import { test, expect } from "bun:test"
import { KicadLibraryConverter } from "lib/kicad-library/KicadLibraryConverter"
import { Circuit } from "tscircuit"
import type { CircuitJson } from "circuit-json"
import * as path from "node:path"

/**
 * Tests that 3D model paths always use relative paths (../../3dmodels/...)
 * which work for both standalone use and KiCad PCM installations.
 */

// Real STEP file path
const stepFilePath = path.resolve(
  __dirname,
  "../assets/SW_Push_1P1T_NO_CK_KMR2.step",
)

// Mock component: KeyHotSocket - custom footprint with real 3D model
async function renderKeyHotSocket(): Promise<CircuitJson> {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <chip
        name="REF**"
        footprint={
          <footprint>
            <smtpad
              shape="rect"
              width="2.5mm"
              height="1.2mm"
              portHints={["pin1"]}
              pcbX={-3.81}
              pcbY={2.54}
            />
            <smtpad
              shape="rect"
              width="2.5mm"
              height="1.2mm"
              portHints={["pin2"]}
              pcbX={2.54}
              pcbY={5.08}
            />
            <hole pcbX={0} pcbY={0} diameter="4mm" />
            <silkscreentext text="SW" pcbY={8} fontSize="1mm" />
          </footprint>
        }
        cadModel={
          <cadmodel
            modelUrl={stepFilePath}
            rotationOffset={{ x: 0, y: 0, z: 0 }}
          />
        }
        pinLabels={{ pin1: "1", pin2: "2" }}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson() as CircuitJson
}

// Mock component: SimpleLedCircuit - uses builtin footprints only
async function renderSimpleLedCircuit(): Promise<CircuitJson> {
  const circuit = new Circuit()
  circuit.add(
    <board width="30mm" height="20mm">
      <resistor name="R1" resistance="220" footprint="0402" pcbX={-5} />
      <capacitor name="C1" capacitance="100nF" footprint="0805" pcbX={0} />
      <diode name="D1" footprint="0603" pcbX={5} />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson() as CircuitJson
}

test("KicadLibraryConverter always uses relative 3D model paths", async () => {
  const mockExports: Record<string, string[]> = {
    "lib/my-keyboard-library.ts": ["KeyHotSocket", "SimpleLedCircuit"],
  }

  const mockCircuitJson: Record<string, CircuitJson> = {
    KeyHotSocket: await renderKeyHotSocket(),
    SimpleLedCircuit: await renderSimpleLedCircuit(),
  }

  const converter = new KicadLibraryConverter({
    kicadLibraryName: "my-keyboard-library",
    entrypoint: "lib/my-keyboard-library.ts",
    getExportsFromTsxFile: async (filePath) => mockExports[filePath] ?? [],
    buildFileToCircuitJson: async (_filePath, componentName) =>
      mockCircuitJson[componentName] ?? null,
    includeBuiltins: true,
  })

  await converter.run()
  const output = converter.getOutput()

  // Snapshot the output structure
  const outputKeys = Object.keys(output.kicadProjectFsMap).sort()
  expect(outputKeys).toMatchInlineSnapshot(`
[
  "footprints/my-keyboard-library.pretty/KeyHotSocket.kicad_mod",
  "footprints/tscircuit_builtin.pretty/capacitor_0805.kicad_mod",
  "footprints/tscircuit_builtin.pretty/diode_0603.kicad_mod",
  "footprints/tscircuit_builtin.pretty/resistor_0402.kicad_mod",
  "fp-lib-table",
  "sym-lib-table",
  "symbols/my-keyboard-library.kicad_sym",
  "symbols/tscircuit_builtin.kicad_sym",
]
`)

  // Get the user symbol library content
  const userSymbolContent =
    output.kicadProjectFsMap["symbols/my-keyboard-library.kicad_sym"]
  expect(userSymbolContent).toBeDefined()

  // Verify symbol footprint reference uses library name without PCM_ prefix
  expect(userSymbolContent).toContain("my-keyboard-library:KeyHotSocket")
  expect(userSymbolContent).not.toContain("PCM_")

  // Get the builtin symbol library content
  const builtinSymbolContent =
    output.kicadProjectFsMap["symbols/tscircuit_builtin.kicad_sym"]
  expect(builtinSymbolContent).toBeDefined()

  // Verify builtin symbol footprint references don't have PCM_ prefix
  expect(builtinSymbolContent).toContain("tscircuit_builtin:")
  expect(builtinSymbolContent).not.toContain("PCM_tscircuit_builtin:")

  // Get the user footprint content
  const userFootprintContent =
    output.kicadProjectFsMap[
      "footprints/my-keyboard-library.pretty/KeyHotSocket.kicad_mod"
    ]
  expect(userFootprintContent).toBeDefined()

  // IMPORTANT: Verify 3D model paths are relative (not ${KICAD_3RD_PARTY})
  // Relative paths work for both standalone use and PCM installations
  expect(userFootprintContent).toContain(
    '(model "../../3dmodels/my-keyboard-library.3dshapes/',
  )
  expect(userFootprintContent).not.toContain("${KICAD_3RD_PARTY}")
})
