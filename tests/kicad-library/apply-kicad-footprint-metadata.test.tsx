import { test, expect } from "bun:test"
import { applyKicadFootprintMetadata } from "lib/kicad-library/kicad-library-converter-utils/applyKicadFootprintMetadata"
import { KicadLibraryConverter } from "lib/kicad-library/KicadLibraryConverter"
import { Circuit } from "tscircuit"
import type { CircuitJson } from "circuit-json"
import type { KicadFootprintMetadata } from "lib/kicad-library/KicadLibraryConverterTypes"

const sampleFootprintString = `(footprint "TestFootprint"
  (version 20241229)
  (generator "pcbnew")
  (generator_version "9.0")
  (layer "F.Cu")
  (attr smd)
  (fp_text reference "REF**" (at 0 0) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))
  (fp_text value "TestFootprint" (at 0 2) (layer "F.Fab") (effects (font (size 1 1) (thickness 0.15))))
  (pad "1" smd rect (at -1 0) (size 1 1) (layers "F.Cu" "F.Paste" "F.Mask"))
  (pad "2" smd rect (at 1 0) (size 1 1) (layers "F.Cu" "F.Paste" "F.Mask"))
  (property "Reference" "REF**" (at 0 0 0) (layer "F.SilkS") (effects (font (size 1.27 1.27) (thickness 0.15))))
  (property "Value" "Val**" (at 0 0 0) (layer "F.Fab") (effects (font (size 1.27 1.27) (thickness 0.15))))
  (property "Datasheet" "" (at 0 0 0) (layer "F.Fab") (hide yes) (effects (font (size 1.27 1.27) (thickness 0.15))))
  (property "Description" "" (at 0 0 0) (layer "F.Fab") (hide yes) (effects (font (size 1.27 1.27) (thickness 0.15))))
  (embedded_fonts no)
)`

test("applyKicadFootprintMetadata applies property values", () => {
  const metadata = {
    properties: {
      Reference: { value: "R**" },
      Value: { value: "10k" },
      Datasheet: { value: "https://example.com/datasheet.pdf", hide: true },
      Description: { value: "10k Ohm SMD resistor", hide: true },
    },
  }

  const result = applyKicadFootprintMetadata(
    sampleFootprintString,
    metadata,
    "TestFootprint",
  )

  // Verify the properties are applied
  expect(result).toContain('(property "Reference" "R**"')
  expect(result).toContain('(property "Value" "10k"')
  expect(result).toContain('(property "Datasheet" "https://example.com/datasheet.pdf"')
  expect(result).toContain('(property "Description" "10k Ohm SMD resistor"')
})

test("applyKicadFootprintMetadata applies version and generator metadata", () => {
  const metadata = {
    version: 20250101,
    generator: "custom_generator",
    generatorVersion: "1.0",
  }

  const result = applyKicadFootprintMetadata(
    sampleFootprintString,
    metadata,
    "TestFootprint",
  )

  expect(result).toContain("(version 20250101)")
  expect(result).toContain("(generator custom_generator)")
  expect(result).toContain("(generator_version 1.0)")
})

test("applyKicadFootprintMetadata handles empty metadata gracefully", () => {
  const metadata = {}

  const result = applyKicadFootprintMetadata(
    sampleFootprintString,
    metadata,
    "TestFootprint",
  )

  // Should return a valid footprint string without errors
  expect(result).toContain("(footprint")
  expect(result).toContain("TestFootprint")
})

test("applyKicadFootprintMetadata preserves footprint structure", () => {
  const metadata = {
    properties: {
      Value: { value: "CustomValue" },
    },
  }

  const result = applyKicadFootprintMetadata(
    sampleFootprintString,
    metadata,
    "TestFootprint",
  )

  // Should still have pads and other elements
  expect(result).toContain('(pad "1"')
  expect(result).toContain('(pad "2"')
  expect(result).toContain("(attr smd)")
})

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

test("KicadLibraryConverter with kicadFootprintMetadata callback", async () => {
  const mockExports: Record<string, string[]> = {
    "lib/my-keyboard-library.ts": ["KeyHotSocket", "SimpleLedCircuit"],
  }

  const mockCircuitJson: Record<string, CircuitJson> = {
    KeyHotSocket: await renderKeyHotSocket(),
    SimpleLedCircuit: await renderSimpleLedCircuit(),
  }

  // Define metadata to be applied via callback
  const componentMetadata: Record<string, KicadFootprintMetadata> = {
    KeyHotSocket: {
      version: 20250122,
      generator: "tscircuit",
      generatorVersion: "1.0.0",
      properties: {
        Reference: { value: "SW**" },
        Value: { value: "MX_SWITCH" },
        Datasheet: { value: "https://example.com/switch-datasheet.pdf", hide: true },
        Description: { value: "Cherry MX mechanical key switch", hide: true },
      },
    },
  }

  const converter = new KicadLibraryConverter({
    kicadLibraryName: "my-keyboard-library",
    entrypoint: "lib/my-keyboard-library.ts",
    getExportsFromTsxFile: async (filePath) => mockExports[filePath] ?? [],
    buildFileToCircuitJson: async (_filePath, componentName) =>
      mockCircuitJson[componentName] ?? null,
    getComponentKicadMetadata: async (_filePath, componentName) =>
      componentMetadata[componentName] ?? null,
    includeBuiltins: true,
  })

  await converter.run()
  const output = converter.getOutput()

  // Verify file structure includes the custom footprint
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

  // Verify fp-lib-table content
  expect(output.kicadProjectFsMap["fp-lib-table"]).toMatchInlineSnapshot(`
    "(fp_lib_table
      (lib (name "my-keyboard-library")(type "KiCad")(uri "\${KIPRJMOD}/footprints/my-keyboard-library.pretty")(options "")(descr ""))
      (lib (name "tscircuit_builtin")(type "KiCad")(uri "\${KIPRJMOD}/footprints/tscircuit_builtin.pretty")(options "")(descr ""))
    )
    "
  `)

  // Verify sym-lib-table content
  expect(output.kicadProjectFsMap["sym-lib-table"]).toMatchInlineSnapshot(`
    "(sym_lib_table
      (lib (name "my-keyboard-library")(type "KiCad")(uri "\${KIPRJMOD}/symbols/my-keyboard-library.kicad_sym")(options "")(descr ""))
      (lib (name "tscircuit_builtin")(type "KiCad")(uri "\${KIPRJMOD}/symbols/tscircuit_builtin.kicad_sym")(options "")(descr ""))
    )
    "
  `)

  // Verify the KeyHotSocket custom footprint is generated with metadata applied
  const keyHotSocketFootprint = output.kicadProjectFsMap[
    "footprints/my-keyboard-library.pretty/KeyHotSocket.kicad_mod"
  ]
  expect(keyHotSocketFootprint).toBeDefined()

  if (keyHotSocketFootprint) {
    const footprintStr = String(keyHotSocketFootprint)

    // The footprint should have the metadata properties applied
    expect(footprintStr).toContain("(version 20250122)")
    expect(footprintStr).toContain("(generator tscircuit)")
    expect(footprintStr).toContain('(property "Reference" "SW**"')
    expect(footprintStr).toContain('(property "Value" "MX_SWITCH"')
    expect(footprintStr).toContain('(property "Datasheet" "https://example.com/switch-datasheet.pdf"')
    expect(footprintStr).toContain('(property "Description" "Cherry MX mechanical key switch"')

    // Snapshot the KeyHotSocket footprint with metadata
    expect(footprintStr).toMatchInlineSnapshot(`
      "(footprint
        "KeyHotSocket"
        (version 20250122)
        (generator tscircuit)
        (generator_version 1.0.0)
        (layer F.Cu)
        (at 0 0 0)
        (descr "")
        (tags "")
        (attr through_hole)
        (embedded_fonts no)
        (property "Reference" "SW**"
          (at 0 0 0)
          (layer F.SilkS)
          (uuid 6afcc420-5595-061f-402d-481e2ac58a1d)
          (effects
            (font
              (size 1.27 1.27)
              (thickness 0.15)
            )
          )
        )
        (property "Value" "MX_SWITCH"
          (at 0 0 0)
          (layer F.Fab)
          (uuid 1ac8a4e0-3e4b-4e9f-61cd-f85e7aaf5de3)
          (effects
            (font
              (size 1.27 1.27)
              (thickness 0.15)
            )
          )
        )
        (property "Datasheet" "https://example.com/switch-datasheet.pdf"
          (at 0 0 0)
          (layer F.Fab)
          (hide yes)
          (uuid 22fa2ee0-0d92-70df-07d5-4d221d3d0b23)
          (effects
            (font
              (size 1.27 1.27)
              (thickness 0.15)
            )
          )
        )
        (property "Description" "Cherry MX mechanical key switch"
          (at 0 0 0)
          (layer F.Fab)
          (hide yes)
          (uuid 212cce00-7b9d-0be1-29f2-b63e307d87a3)
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
  }

  // Verify symbols file contains the KeyHotSocket component
  const symbolsFile = output.kicadProjectFsMap[
    "symbols/my-keyboard-library.kicad_sym"
  ]
  expect(symbolsFile).toBeDefined()
  if (symbolsFile) {
    expect(String(symbolsFile)).toContain("KeyHotSocket")
  }
})
