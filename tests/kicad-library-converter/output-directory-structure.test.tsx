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

  const files = Object.keys(output.kicadProjectFsMap).sort()

  expect(files).toMatchInlineSnapshot(`
    [
      "footprints/custom-lib.pretty/MyComponent.kicad_mod",
      "footprints/tscircuit_builtin.pretty/resistor_0402.kicad_mod",
      "fp-lib-table",
      "sym-lib-table",
      "symbols/custom-lib.kicad_sym",
      "symbols/tscircuit_builtin.kicad_sym",
    ]
  `)
})
