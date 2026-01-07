import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { KicadLibraryConverter } from "lib/kicad-library/KicadLibraryConverter"

test("KicadLibraryConverter generates library from multiple component exports", async () => {
  const mockCircuitJsons: Record<string, any> = {}

  // Create circuit JSON for "SpacebarKey" component
  const spacebarCircuit = new Circuit()
  spacebarCircuit.add(
    <board width="50mm" height="20mm">
      <chip
        name="SpacebarKey"
        footprint={
          <footprint>
            <platedhole
              pcbX={0}
              pcbY={0}
              holeDiameter="1.5mm"
              outerDiameter="2.5mm"
              shape="circle"
            />
          </footprint>
        }
      />
    </board>,
  )
  await spacebarCircuit.renderUntilSettled()
  mockCircuitJsons["lib/components/SpacebarKey.tsx"] =
    spacebarCircuit.getCircuitJson()

  // Create circuit JSON for "NormalKey" component
  const normalKeyCircuit = new Circuit()
  normalKeyCircuit.add(
    <board width="20mm" height="20mm">
      <chip
        name="NormalKey"
        footprint={
          <footprint>
            <platedhole
              pcbX={0}
              pcbY={0}
              holeDiameter="1.2mm"
              outerDiameter="2mm"
              shape="circle"
            />
          </footprint>
        }
      />
    </board>,
  )
  await normalKeyCircuit.renderUntilSettled()
  mockCircuitJsons["lib/components/NormalKey.tsx"] =
    normalKeyCircuit.getCircuitJson()

  const converter = new KicadLibraryConverter({
    libraryName: "my-library",
    filePaths: ["lib/my-footprint-library.ts"],
    buildFileToCircuitJson: async (filePath: string) => {
      return mockCircuitJsons[filePath] ?? []
    },
    getExportsFromTsxFile: async () => {
      return ["SpacebarKey", "NormalKey"]
    },
    resolveExportPath: async (entrypoint: string, exportName: string) => {
      const exportPaths: Record<string, string> = {
        SpacebarKey: "lib/components/SpacebarKey.tsx",
        NormalKey: "lib/components/NormalKey.tsx",
      }
      return exportPaths[exportName] ?? null
    },
  })

  await converter.run()
  const output = converter.getOutput()

  const files = Object.keys(output.kicadProjectFsMap).sort()

  expect(files).toMatchInlineSnapshot(`
    [
      "footprints/my-library.pretty/NormalKey.kicad_mod",
      "footprints/my-library.pretty/SpacebarKey.kicad_mod",
      "fp-lib-table",
      "sym-lib-table",
      "symbols/my-library.kicad_sym",
    ]
  `)
})
