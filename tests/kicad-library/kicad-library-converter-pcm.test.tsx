import { test, expect } from "bun:test"
import { KicadLibraryConverter } from "lib/kicad-library/KicadLibraryConverter"
import { Circuit } from "tscircuit"
import type { CircuitJson } from "circuit-json"
import * as path from "node:path"

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

test("KicadLibraryConverter with forPcm=true generates PCM-compatible paths", async () => {
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
    isPcm: true,
    kicadPcmPackageId: "com_tscircuit_author_my-keyboard-library",
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
  expect(userSymbolContent).toMatchInlineSnapshot(`
    "(kicad_symbol_lib
      (version 20211014)
      (generator circuit-json-to-kicad)
      (symbol "KeyHotSocket"
        (pin_numbers
          (hide no)
        )
        (pin_names
          (offset 1.27)
        )
        (exclude_from_sim no)
        (in_bom yes)
        (on_board yes)
        (property "Reference" "U"
          (id 0)
          (at 2.032 0 90)
          (effects
            (font
              (size 1.27 1.27)
            )
          )
        )
        (property "Value" "U"
          (id 1)
          (at 0 0 90)
          (effects
            (font
              (size 1.27 1.27)
            )
          )
        )
        (property "Footprint" "PCM_my-keyboard-library:KeyHotSocket"
          (id 2)
          (at -1.778 0 90)
          (effects
            (font
              (size 1.27 1.27)
            )
            (hide yes)
          )
        )
        (property "Datasheet" "~"
          (id 3)
          (at 0 0 0)
          (effects
            (font
              (size 1.27 1.27)
            )
            (hide yes)
          )
        )
        (property "Description" "Integrated Circuit"
          (id 4)
          (at 0 0 0)
          (effects
            (font
              (size 1.27 1.27)
            )
            (hide yes)
          )
        )
        (property "ki_keywords" "U IC chip"
          (id 5)
          (at 0 0 0)
          (effects
            (font
              (size 1.27 1.27)
            )
            (hide yes)
          )
        )
        (property "ki_fp_filters" "*"
          (id 6)
          (at 0 0 0)
          (effects
            (font
              (size 1.27 1.27)
            )
            (hide yes)
          )
        )
        (symbol "KeyHotSocket_0_1"
          (polyline
            (pts
              (xy -9.000000000000002 -3)
              (xy 9.000000000000002 -3)
              (xy 9.000000000000002 3)
              (xy -9.000000000000002 3)
              (xy -9.000000000000002 -3)
            )
            (stroke
              (width 0.254)
              (type default)
            )
            (fill
              (type background)
            )
          )
        )
        (symbol "KeyHotSocket_1_1"
          (pin passive line
            (at -15.000000000000002 0 0)
            (length 6)
            (name "1"
              (effects
                (font
                  (size 1.27 1.27)
                )
              )
            )
            (number "1"
              (effects
                (font
                  (size 1.27 1.27)
                )
              )
            )
          )
          (pin passive line
            (at 15.000000000000002 0 180)
            (length 6)
            (name "2"
              (effects
                (font
                  (size 1.27 1.27)
                )
              )
            )
            (number "2"
              (effects
                (font
                  (size 1.27 1.27)
                )
              )
            )
          )
        )
        (embedded_fonts no)
      )
    )"
  `)

  // Verify symbol footprint reference has PCM_ prefix for user library
  expect(userSymbolContent).toContain("PCM_my-keyboard-library:KeyHotSocket")

  // Get the builtin symbol library content
  const builtinSymbolContent =
    output.kicadProjectFsMap["symbols/tscircuit_builtin.kicad_sym"]
  expect(builtinSymbolContent).toBeDefined()

  // Verify builtin symbol footprint references have PCM_ prefix
  expect(builtinSymbolContent).toContain("PCM_tscircuit_builtin:")

  // Get the user footprint content
  const userFootprintContent =
    output.kicadProjectFsMap[
      "footprints/my-keyboard-library.pretty/KeyHotSocket.kicad_mod"
    ]
  expect(userFootprintContent).toBeDefined()
  expect(userFootprintContent).toMatchInlineSnapshot(`
    "(footprint
      "KeyHotSocket"
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
      (model "../../3dmodels/my-keyboard-library.3dshapes/SW_Push_1P1T_NO_CK_KMR2.step"
        (offset
          (xyz 0 0 0.7)
        )
        (rotate
          (xyz 0 0 0)
        )
      )
    )"
  `)
})
