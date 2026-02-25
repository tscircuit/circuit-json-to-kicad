import { test, expect } from "bun:test"
import { KicadLibraryConverter } from "lib/kicad-library/KicadLibraryConverter"
import { Circuit } from "tscircuit"
import type { CircuitJson } from "circuit-json"
import path from "path"

const stepFilePath = path.resolve(
  __dirname,
  "../assets/SW_Push_1P1T_NO_CK_KMR2.step",
)

// Mock component: a simple board with default export and 3D model
async function renderDefaultExportBoard(): Promise<CircuitJson> {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="10mm">
      <chip
        name="U1"
        footprint={
          <footprint>
            <smtpad
              shape="rect"
              width="1mm"
              height="0.5mm"
              portHints={["pin1"]}
              pcbX={-1}
            />
            <smtpad
              shape="rect"
              width="1mm"
              height="0.5mm"
              portHints={["pin2"]}
              pcbX={1}
            />
          </footprint>
        }
        cadModel={{
          stepUrl: stepFilePath,
          rotationOffset: { x: 0, y: 0, z: 0 },
        }}
        pinLabels={{ pin1: "1", pin2: "2" }}
      />
      <resistor resistance="1k" footprint="0402" name="R1" pcbX={5} />
      <trace from=".U1 > .pin1" to=".R1 > .pin1" />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson() as CircuitJson
}

test("KicadLibraryConverter handles default export from entrypoint", async () => {
  // Mock file with only a default export (no named exports)
  const mockExports: Record<string, string[]> = {
    "my-circuit.tsx": ["default"],
  }

  const receivedExportNames: string[] = []

  const converter = new KicadLibraryConverter({
    kicadLibraryName: "my-circuit",
    entrypoint: "my-circuit.tsx",
    getExportsFromTsxFile: async (filePath) => mockExports[filePath] ?? [],
    buildFileToCircuitJson: async (_filePath, componentName) => {
      receivedExportNames.push(componentName)
      if (componentName === "default") {
        return await renderDefaultExportBoard()
      }
      return null
    },
    includeBuiltins: true,
  })

  await converter.run()
  const output = converter.getOutput()

  // Verify that buildFileToCircuitJson was called with "default"
  expect(receivedExportNames).toContain("default")

  // Verify output structure - component name should be derived from filename (kept as-is)
  const outputKeys = Object.keys(output.kicadProjectFsMap).sort()
  expect(outputKeys).toMatchInlineSnapshot(`
[
  "footprints/my-circuit.pretty/my-circuit.kicad_mod",
  "footprints/tscircuit_builtin.pretty/resistor_0402.kicad_mod",
  "fp-lib-table",
  "sym-lib-table",
  "symbols/my-circuit.kicad_sym",
  "symbols/tscircuit_builtin.kicad_sym",
]
`)

  // Verify 3D model paths are collected
  expect(output.model3dSourcePaths.length).toBe(2)
})

test("KicadLibraryConverter resolves path for re-exported default exports", async () => {
  // Entrypoint re-exports default from another file:
  // export { default } from "./components/MainBoard"
  const mockExports: Record<string, string[]> = {
    "lib/my-library.ts": ["default"],
  }

  const resolvedPaths: Array<{ entrypoint: string; exportName: string }> = []
  const buildCalls: Array<{ filePath: string; componentName: string }> = []

  const converter = new KicadLibraryConverter({
    kicadLibraryName: "my-library",
    entrypoint: "lib/my-library.ts",
    getExportsFromTsxFile: async (filePath) => mockExports[filePath] ?? [],
    resolveExportPath: async (entrypoint, exportName) => {
      resolvedPaths.push({ entrypoint, exportName })
      if (exportName === "default") {
        return "lib/components/MainBoard.tsx"
      }
      return null
    },
    buildFileToCircuitJson: async (filePath, componentName) => {
      buildCalls.push({ filePath, componentName })
      if (componentName === "default") {
        return await renderDefaultExportBoard()
      }
      return null
    },
    includeBuiltins: false,
  })

  await converter.run()
  const output = converter.getOutput()

  // Verify resolveExportPath was called with "default"
  expect(resolvedPaths).toContainEqual({
    entrypoint: "lib/my-library.ts",
    exportName: "default",
  })

  // Verify buildFileToCircuitJson was called with the resolved path
  expect(buildCalls).toContainEqual({
    filePath: "lib/components/MainBoard.tsx",
    componentName: "default",
  })

  // Verify component name is derived from resolved path (MainBoard.tsx -> MainBoard)
  const outputKeys = Object.keys(output.kicadProjectFsMap).sort()
  expect(outputKeys).toMatchInlineSnapshot(`
    [
      "footprints/my-library.pretty/MainBoard.kicad_mod",
      "fp-lib-table",
      "sym-lib-table",
      "symbols/my-library.kicad_sym",
    ]
  `)
  expect(outputKeys).toContain(
    "footprints/my-library.pretty/MainBoard.kicad_mod",
  )
  expect(outputKeys).toContain("symbols/my-library.kicad_sym")
})
