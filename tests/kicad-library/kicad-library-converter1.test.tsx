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
      <resistor name="REF**" resistance="220" footprint="0402" pcbX={-5} />
      <capacitor name="REF**" capacitance="100nF" footprint="0805" pcbX={0} />
      <diode name="REF**" footprint="0603" pcbX={5} />
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

  expect(
    output.kicadProjectFsMap[
      "footprints/my-keyboard-library.pretty/KeyHotSocket.kicad_mod"
    ],
  ).toMatchInlineSnapshot(`
    "(footprint
      "KeyHotSocket"
      (version 20241229)
      (generator pcbnew)
      (generator_version 9)
      (layer F.Cu)
      (at 0 0 0)
      (descr "")
      (tags "")
      (attr through_hole)
      (embedded_fonts no)
      (property "Reference" "Ref**"
        (at 0 0 0)
        (layer F.SilkS)
        (uuid 521fe180-3a89-2d01-38cd-c47e53db4a03)
        (effects
          (font
            (size 1.27 1.27)
            (thickness 0.15)
          )
        )
      )
      (property "Value" "Val**"
        (at 0 0 0)
        (layer F.Fab)
        (uuid 59786640-408c-b2ff-256e-33c27496e57d)
        (effects
          (font
            (size 1.27 1.27)
            (thickness 0.15)
          )
        )
      )
      (property "Datasheet" ""
        (at 0 0 0)
        (layer F.Fab)
        (hide yes)
        (uuid 6b33c240-2175-4c41-51e1-a53e3ac76943)
        (effects
          (font
            (size 1.27 1.27)
            (thickness 0.15)
          )
        )
      )
      (property "Description" ""
        (at 0 0 0)
        (layer F.Fab)
        (hide yes)
        (uuid 06594860-0cf8-b6c1-1398-25221a379383)
        (effects
          (font
            (size 1.27 1.27)
            (thickness 0.15)
          )
        )
      )
      (fp_text
        user
        "SW"
        (at 0.6350000000000002 -6.16 0)
        (layer F.SilkS)
        (effects
          (font
            (size 0.6666666666666666 0.6666666666666666)
          )
        )
      )
      (pad "1" smd rect
        (at -3.175 -0.7000000000000002 0)
        (size 2.5 1.2)
        (layers F.Cu F.Paste F.Mask)
        (uuid 633a4dec-1f37-b14c-24ca-eb5468cd87f4)
      )
      (pad "2" smd rect
        (at 3.1750000000000003 -3.24 0)
        (size 2.5 1.2)
        (layers F.Cu F.Paste F.Mask)
        (uuid 07e0ff52-4be3-9bf2-7019-c76e2c172ace)
      )
      (pad "" np_thru_hole circle
        (at 0.6350000000000002 1.8399999999999999 0)
        (size 4 4)
        (drill 4)
        (layers *.Cu *.Mask)
        (uuid 51b679a0-2a9d-c901-0385-18622393983d)
      )
    )"
  `)
})
