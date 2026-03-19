import { test, expect } from "bun:test"
import { KicadLibraryConverter } from "lib/kicad-library/KicadLibraryConverter"
import { Circuit } from "tscircuit"
import type { CircuitJson } from "circuit-json"

async function renderCircuit(): Promise<CircuitJson> {
  const circuit = new Circuit()
  circuit.add(
    <board width="25mm" height="40mm">
      <resistor
        resistance="1k"
        footprint="0402"
        name="R1"
        pcbY={-7}
        pcbX={-2}
      />
      <capacitor
        capacitance="1000pF"
        footprint="0402"
        name="C1"
        pcbY={-7}
        pcbX={1}
      />
      <chip
        name="U2"
        footprint="pushbutton"
        pcbY={-14}
        pcbX={-3}
        cadModel={{
          stepUrl: "https://modelcdn.tscircuit.com/jscad_models/soic8.step",
          rotationOffset: { x: 0, y: 0, z: 0 },
        }}
      />
      <trace from=".R1 > .pin1" to=".C1 > .pin1" />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson() as CircuitJson
}

test("kicad-library includes stepUrl user model in model3dSourcePaths", async () => {
  const circuitJson = await renderCircuit()

  const converter = new KicadLibraryConverter({
    kicadLibraryName: "test_lib",
    entrypoint: "lib/test_lib.ts",
    getExportsFromTsxFile: async () => ["TestCircuit"],
    buildFileToCircuitJson: async () => circuitJson,
    includeBuiltins: true,
  })

  await converter.run()
  const output = converter.getOutput()
  expect(output.model3dSourcePaths).toMatchInlineSnapshot(`
    [
      "https://modelcdn.tscircuit.com/jscad_models/0402.step",
      "https://modelcdn.tscircuit.com/jscad_models/soic8.step",
    ]
  `)

  // The .kicad_mod for U2 (chip with stepUrl) should reference the user model in {fpLibraryName}.3dshapes
  const fsMap = output.kicadProjectFsMap
  const kicadModKeys = Object.keys(fsMap).filter((k) =>
    k.endsWith(".kicad_mod"),
  )
  expect(kicadModKeys.length).toBeGreaterThan(0)
  expect(kicadModKeys).toMatchInlineSnapshot(`
    [
      "footprints/test_lib.pretty/TestCircuit.kicad_mod",
      "footprints/tscircuit_builtin.pretty/resistor_0402.kicad_mod",
      "footprints/tscircuit_builtin.pretty/capacitor_0402.kicad_mod",
    ]
  `)
  // Remote stepUrl → tscircuit_builtin.3dshapes (not {fpLibraryName}.3dshapes)
  const testCircuitMod = fsMap[
    "footprints/test_lib.pretty/TestCircuit.kicad_mod"
  ] as string
  expect(testCircuitMod).toContain(
    "../../3dmodels/tscircuit_builtin.3dshapes/soic8.step",
  )
})
