import { test, expect } from "bun:test"
import { KicadLibraryConverter } from "lib/kicad-library/KicadLibraryConverter"
import { Circuit } from "tscircuit"
import type { CircuitJson } from "circuit-json"

// Mock component: KeyHotSocket - custom footprint with 3D model reference
async function renderKeyHotSocket(): Promise<CircuitJson> {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <chip
        name="SW1"
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
        cadModel={{
          stlUrl: "/path/to/CherryMxSwitch.step",
          rotationOffset: { x: 0, y: 0, z: 0 },
        }}
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

test("KicadLibraryConverter with mock keyboard library", async () => {
  // Mock file structure similar to example project
  // The entrypoint re-exports components from internal files
  const mockExports: Record<string, string[]> = {
    "lib/my-keyboard-library.ts": ["KeyHotSocket", "SimpleLedCircuit"],
    // Internal component file - exports should be ignored since they're not from entrypoint
    "lib/components/KeySocket.ts": ["KeyHotSocket", "InternalHelper"],
  }

  const mockCircuitJson: Record<string, CircuitJson> = {
    KeyHotSocket: await renderKeyHotSocket(),
    SimpleLedCircuit: await renderSimpleLedCircuit(),
  }

  const converter = new KicadLibraryConverter({
    libraryName: "my-keyboard-library",
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

  // Snapshot library tables
  expect(output.kicadProjectFsMap["fp-lib-table"]).toMatchInlineSnapshot(`
"(fp_lib_table
  (lib (name "my-keyboard-library")(type "KiCad")(uri "\${KIPRJMOD}/footprints/my-keyboard-library.pretty")(options "")(descr ""))
  (lib (name "tscircuit_builtin")(type "KiCad")(uri "\${KIPRJMOD}/footprints/tscircuit_builtin.pretty")(options "")(descr ""))
)
"
`)

  expect(output.kicadProjectFsMap["sym-lib-table"]).toMatchInlineSnapshot(`
"(sym_lib_table
  (lib (name "my-keyboard-library")(type "KiCad")(uri "\${KIPRJMOD}/symbols/my-keyboard-library.kicad_sym")(options "")(descr ""))
  (lib (name "tscircuit_builtin")(type "KiCad")(uri "\${KIPRJMOD}/symbols/tscircuit_builtin.kicad_sym")(options "")(descr ""))
)
"
`)
})
