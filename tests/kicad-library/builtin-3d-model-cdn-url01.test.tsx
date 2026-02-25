import { test, expect } from "bun:test"
import { KicadLibraryConverter } from "lib/kicad-library/KicadLibraryConverter"
import { Circuit } from "tscircuit"
import type { CircuitJson } from "circuit-json"
import { MODEL_CDN_BASE_URL } from "lib/kicad-library/stages/ExtractFootprintsStage"

async function renderBuiltinComponents(): Promise<CircuitJson> {
  const circuit = new Circuit()
  circuit.add(
    <board width="30mm" height="20mm">
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-5} />
      <capacitor name="C1" capacitance="100nF" footprint="0603" pcbX={0} />
      <diode name="D1" footprint="0805" pcbX={5} />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson() as CircuitJson
}

test("builtin footprints get 3D model CDN URLs and use tscircuit_builtin.3dshapes", async () => {
  const mockCircuitJson = await renderBuiltinComponents()

  const converter = new KicadLibraryConverter({
    kicadLibraryName: "test_lib",
    entrypoint: "lib/test_lib.ts",
    getExportsFromTsxFile: async () => ["BuiltinComponents"],
    buildFileToCircuitJson: async () => mockCircuitJson,
    includeBuiltins: true,
  })

  await converter.run()
  const output = converter.getOutput()

  // CDN source paths for downloading
  expect(output.model3dSourcePaths.sort()).toMatchInlineSnapshot(`
[
  "https://modelcdn.tscircuit.com/jscad_models/0402.step",
  "https://modelcdn.tscircuit.com/jscad_models/0603.step",
  "https://modelcdn.tscircuit.com/jscad_models/0805.step",
]
`)

  // Builtin .kicad_mod files should reference tscircuit_builtin.3dshapes (not test_lib.3dshapes)
  const fsMap = output.kicadProjectFsMap
  const builtinFpKeys = Object.keys(fsMap)
    .filter(
      (k) => k.includes("tscircuit_builtin.pretty") && k.endsWith(".kicad_mod"),
    )
    .sort()

  expect(builtinFpKeys).toMatchInlineSnapshot(`
[
  "footprints/tscircuit_builtin.pretty/capacitor_0603.kicad_mod",
  "footprints/tscircuit_builtin.pretty/diode_0805.kicad_mod",
  "footprints/tscircuit_builtin.pretty/resistor_0402.kicad_mod",
]
`)

  // Extract model lines from each builtin footprint
  const modelLines = builtinFpKeys.map((key) => {
    const content = fsMap[key] as string
    const match = content.match(/\(model\s+"([^"]+)"/)
    return `${key.split("/").pop()}: ${match?.[1]}`
  })

  expect(modelLines).toMatchInlineSnapshot(`
[
  "capacitor_0603.kicad_mod: ../../3dmodels/tscircuit_builtin.3dshapes/0603.step",
  "diode_0805.kicad_mod: ../../3dmodels/tscircuit_builtin.3dshapes/0805.step",
  "resistor_0402.kicad_mod: ../../3dmodels/tscircuit_builtin.3dshapes/0402.step",
]
`)
})
