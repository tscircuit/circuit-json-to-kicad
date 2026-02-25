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

test("builtin footprints get 3D model CDN URLs from modelcdn.tscircuit.com", async () => {
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

  // All builtin footprints should have CDN model source paths
  const modelPaths = output.model3dSourcePaths
  expect(modelPaths.length).toBe(3)

  // Every model path for builtin footprints should point to the CDN
  for (const modelPath of modelPaths) {
    expect(modelPath).toContain(MODEL_CDN_BASE_URL)
    expect(modelPath).toEndWith(".step")
  }

  // Verify specific footprinter_string-based URLs exist
  // e.g. https://modelcdn.tscircuit.com/jscad_models/0402.step
  const has0402 = modelPaths.some((p) => p.includes("/0402.step"))
  const has0603 = modelPaths.some((p) => p.includes("/0603.step"))
  const has0805 = modelPaths.some((p) => p.includes("/0805.step"))
  expect(has0402).toBe(true)
  expect(has0603).toBe(true)
  expect(has0805).toBe(true)

  // Verify the builtin .kicad_mod files in the fs map reference 3D models
  const fsMap = output.kicadProjectFsMap
  const builtinFpKeys = Object.keys(fsMap).filter(
    (k) => k.includes("tscircuit_builtin.pretty") && k.endsWith(".kicad_mod"),
  )
  expect(builtinFpKeys.length).toBe(3)

  for (const key of builtinFpKeys) {
    const content = fsMap[key] as string
    expect(content).toContain("(model")
    expect(content).toContain(".3dshapes")
    expect(content).toContain(".step")
  }
})
