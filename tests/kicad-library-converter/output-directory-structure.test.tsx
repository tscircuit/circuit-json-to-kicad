import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { KicadLibraryConverter } from "lib/kicad-library/KicadLibraryConverter"

test("KicadLibraryConverter outputs correct directory structure", async () => {
  const mockCircuitJsons: Record<string, any> = {}

  // Create a component that uses a builtin footprint (resistor with 0402)
  const component = new Circuit()
  component.add(
    <board width="10mm" height="10mm">
      <chip
        name="MyComponent"
        footprint={
          <footprint>
            <smtpad pcbX={0} pcbY={0} width="1mm" height="1mm" shape="rect" />
          </footprint>
        }
      />
      <resistor name="R1" resistance="10k" footprint="0402" />
    </board>,
  )
  await component.renderUntilSettled()
  mockCircuitJsons["lib/MyComponent.tsx"] = component.getCircuitJson()

  const converter = new KicadLibraryConverter({
    libraryName: "custom-lib",
    filePaths: ["lib/index.ts"],
    buildFileToCircuitJson: async (filePath: string) => {
      return mockCircuitJsons[filePath] ?? []
    },
    getExportsFromTsxFile: async () => {
      return ["MyComponent"]
    },
    resolveExportPath: async (entrypoint: string, exportName: string) => {
      return `lib/${exportName}.tsx`
    },
  })

  await converter.run()
  const output = converter.getOutput()

  const files = Object.keys(output.kicadProjectFsMap)

  // User symbols should be in symbols/<lib>.kicad_sym
  expect(files.some((f) => f === "symbols/custom-lib.kicad_sym")).toBe(true)

  // Builtin symbols should be in symbols/tscircuit_builtin.kicad_sym
  expect(files.some((f) => f === "symbols/tscircuit_builtin.kicad_sym")).toBe(
    true,
  )

  // User footprints should be in footprints/<lib>.pretty/
  expect(
    files.some(
      (f) => f === "footprints/custom-lib.pretty/MyComponent.kicad_mod",
    ),
  ).toBe(true)

  // Builtin footprints should be in footprints/tscircuit_builtin.pretty/
  expect(
    files.some((f) => f.startsWith("footprints/tscircuit_builtin.pretty/")),
  ).toBe(true)

  // Library tables should be at root
  expect(files).toContain("fp-lib-table")
  expect(files).toContain("sym-lib-table")
})
