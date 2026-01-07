import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { KicadLibraryConverter } from "lib/kicad-library/KicadLibraryConverter"

test("KicadLibraryConverter generates library from file paths", async () => {
  // Mock component circuit JSONs
  const mockCircuitJsons: Record<string, any> = {}

  // Create circuit JSON for a "SpacebarKey" component
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
            <platedhole
              pcbX={10}
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

  // Create circuit JSON for a "NormalKey" component
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

  // Mock exports for library entrypoint
  const mockExports: Record<string, string[]> = {
    "lib/my-footprint-library.ts": [
      "SpacebarKey",
      "NormalKey",
      "notExportedToKicad", // string, should be ignored
    ],
  }

  const converter = new KicadLibraryConverter({
    libraryName: "my-library",
    filePaths: ["lib/my-footprint-library.ts"],
    buildFileToCircuitJson: async (filePath: string) => {
      return mockCircuitJsons[filePath] ?? []
    },
    getExportsFromTsxFile: async (filePath: string) => {
      return mockExports[filePath] ?? []
    },
    resolveExportPath: async (entrypoint: string, exportName: string) => {
      // Map export names to their file paths
      const exportPaths: Record<string, string> = {
        SpacebarKey: "lib/components/SpacebarKey.tsx",
        NormalKey: "lib/components/NormalKey.tsx",
      }
      return exportPaths[exportName] ?? null
    },
  })

  await converter.run()
  const output = converter.getOutput()

  // Verify kicadProjectFsMap structure
  expect(output.kicadProjectFsMap).toBeDefined()
  expect(typeof output.kicadProjectFsMap).toBe("object")

  // Should have footprint files
  const footprintFiles = Object.keys(output.kicadProjectFsMap).filter((p) =>
    p.endsWith(".kicad_mod"),
  )
  expect(footprintFiles.length).toBeGreaterThanOrEqual(2)

  // Should have symbol library
  const symbolFiles = Object.keys(output.kicadProjectFsMap).filter((p) =>
    p.endsWith(".kicad_sym"),
  )
  expect(symbolFiles.length).toBeGreaterThanOrEqual(1)

  // Should have library tables
  expect(
    Object.keys(output.kicadProjectFsMap).some((p) =>
      p.includes("fp-lib-table"),
    ),
  ).toBe(true)
  expect(
    Object.keys(output.kicadProjectFsMap).some((p) =>
      p.includes("sym-lib-table"),
    ),
  ).toBe(true)

  // Verify footprint names match export names
  expect(footprintFiles.some((p) => p.includes("SpacebarKey"))).toBe(true)
  expect(footprintFiles.some((p) => p.includes("NormalKey"))).toBe(true)
})

test("KicadLibraryConverter handles export * from pattern", async () => {
  // This test verifies that getExportsFromTsxFile is called (not TSX parsing)
  // and can handle re-exports like `export * from "./components"`

  const mockCircuitJsons: Record<string, any> = {}

  // Create a simple chip
  const chipCircuit = new Circuit()
  chipCircuit.add(
    <board width="10mm" height="10mm">
      <chip
        name="MyChip"
        footprint={
          <footprint>
            <smtpad
              pcbX={0}
              pcbY={0}
              width="1mm"
              height="1mm"
              shape="rect"
            />
          </footprint>
        }
      />
    </board>,
  )
  await chipCircuit.renderUntilSettled()
  mockCircuitJsons["lib/components/MyChip.tsx"] = chipCircuit.getCircuitJson()

  // The entrypoint uses `export * from` which requires evaluation
  const mockExports: Record<string, string[]> = {
    "lib/index.ts": ["MyChip", "AnotherChip"],
  }

  const converter = new KicadLibraryConverter({
    libraryName: "test-lib",
    filePaths: ["lib/index.ts"],
    buildFileToCircuitJson: async (filePath: string) => {
      return mockCircuitJsons[filePath] ?? []
    },
    getExportsFromTsxFile: async (filePath: string) => {
      // This callback should be implemented by evaluating the file
      // NOT by parsing TSX - export * from patterns require evaluation
      return mockExports[filePath] ?? []
    },
    resolveExportPath: async (entrypoint: string, exportName: string) => {
      if (exportName === "MyChip") return "lib/components/MyChip.tsx"
      return null
    },
  })

  await converter.run()
  const output = converter.getOutput()

  expect(output.kicadProjectFsMap).toBeDefined()
})

test("KicadLibraryConverter filters out non-component exports", async () => {
  // Only uppercase function exports should be treated as components
  const mockCircuitJsons: Record<string, any> = {}

  const chipCircuit = new Circuit()
  chipCircuit.add(
    <board width="10mm" height="10mm">
      <chip
        name="ValidComponent"
        footprint={
          <footprint>
            <smtpad pcbX={0} pcbY={0} width="1mm" height="1mm" shape="rect" />
          </footprint>
        }
      />
    </board>,
  )
  await chipCircuit.renderUntilSettled()
  mockCircuitJsons["lib/ValidComponent.tsx"] = chipCircuit.getCircuitJson()

  const converter = new KicadLibraryConverter({
    libraryName: "filter-test",
    filePaths: ["lib/index.ts"],
    buildFileToCircuitJson: async (filePath: string) => {
      return mockCircuitJsons[filePath] ?? []
    },
    getExportsFromTsxFile: async () => {
      return [
        "ValidComponent", // Should be included (uppercase, function)
        "helperFunction", // Should be ignored (lowercase)
        "CONSTANT_VALUE", // Might be included but will fail circuit JSON generation
        "SomeType", // Types should be filtered somehow
      ]
    },
    resolveExportPath: async (entrypoint: string, exportName: string) => {
      if (exportName === "ValidComponent") return "lib/ValidComponent.tsx"
      return null // Non-component exports return null
    },
  })

  await converter.run()
  const output = converter.getOutput()

  // Should only have the valid component footprint
  const footprintFiles = Object.keys(output.kicadProjectFsMap).filter((p) =>
    p.endsWith(".kicad_mod"),
  )
  expect(footprintFiles.some((p) => p.includes("ValidComponent"))).toBe(true)
})
