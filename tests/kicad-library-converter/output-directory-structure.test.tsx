import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { KicadLibraryConverter } from "lib/kicad-library/KicadLibraryConverter"

test("KicadLibraryConverter outputs correct directory structure", async () => {
  const mockCircuitJsons: Record<string, any> = {}

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

  // Symbols should be in symbols/ directory
  expect(files.some((f) => f.startsWith("symbols/"))).toBe(true)
  expect(files.some((f) => f === "symbols/custom-lib.kicad_sym")).toBe(true)

  // Footprints should be in footprints/<lib>.pretty/ directory
  expect(files.some((f) => f.startsWith("footprints/"))).toBe(true)
  expect(
    files.some(
      (f) => f === "footprints/custom-lib.pretty/MyComponent.kicad_mod",
    ),
  ).toBe(true)

  // Library tables should be at root
  expect(files).toContain("fp-lib-table")
  expect(files).toContain("sym-lib-table")
})
