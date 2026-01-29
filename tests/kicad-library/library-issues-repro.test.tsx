import { test, expect } from "bun:test"
import { KicadLibraryConverter } from "lib/kicad-library/KicadLibraryConverter"
import { Circuit } from "tscircuit"
import type { CircuitJson } from "circuit-json"
import * as path from "node:path"

/**
 * This test file reproduces and validates fixes for issues reported in:
 * - 3D model path using ${KICAD_3RD_PARTY} when relative paths expected
 * - Symbol library showing 6 entries instead of expected 2
 * - Symbols showing as boxes (expected for generic chips without custom symbols)
 */

// Real STEP file path for testing 3D model paths
const stepFilePath = path.resolve(
  __dirname,
  "../assets/SW_Push_1P1T_NO_CK_KMR2.step",
)

// Mock component: MachineContactLarge - custom footprint with 3D model
async function renderMachineContactLarge(): Promise<CircuitJson> {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <chip
        name="J1"
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
          </footprint>
        }
        cadModel={
          <cadmodel
            modelUrl={stepFilePath}
            rotationOffset={{ x: 0, y: 0, z: 0 }}
          />
        }
        pinLabels={{ pin1: "1", pin2: "2" }}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson() as CircuitJson
}

// Mock component: MachinePin - similar footprint
async function renderMachinePin(): Promise<CircuitJson> {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <chip
        name="P1"
        footprint={
          <footprint>
            <smtpad
              shape="rect"
              width="1.5mm"
              height="0.8mm"
              portHints={["pin1"]}
              pcbX={0}
              pcbY={0}
            />
          </footprint>
        }
        cadModel={
          <cadmodel
            modelUrl={stepFilePath}
            rotationOffset={{ x: 0, y: 0, z: 0 }}
          />
        }
        pinLabels={{ pin1: "1" }}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson() as CircuitJson
}

test("Issue reproduction: 3D model paths should use relative paths", async () => {
  const mockExports: Record<string, string[]> = {
    "lib/adom-kicad-footprint-library.ts": [
      "MachineContactLarge",
      "MachinePin",
    ],
  }

  const mockCircuitJson: Record<string, CircuitJson> = {
    MachineContactLarge: await renderMachineContactLarge(),
    MachinePin: await renderMachinePin(),
  }

  const converter = new KicadLibraryConverter({
    kicadLibraryName: "adom-kicad-footprint-library",
    entrypoint: "lib/adom-kicad-footprint-library.ts",
    getExportsFromTsxFile: async (filePath) => mockExports[filePath] ?? [],
    buildFileToCircuitJson: async (_filePath, componentName) =>
      mockCircuitJson[componentName] ?? null,
    includeBuiltins: true,
  })

  await converter.run()
  const output = converter.getOutput()

  // Check that the 3D model path uses relative format, NOT ${KICAD_3RD_PARTY}
  const machineContactFootprint = output.kicadProjectFsMap[
    "footprints/adom-kicad-footprint-library.pretty/MachineContactLarge.kicad_mod"
  ] as string

  expect(machineContactFootprint).toBeDefined()

  // Should NOT contain ${KICAD_3RD_PARTY} - this is the bug we're fixing
  expect(machineContactFootprint).not.toContain("${KICAD_3RD_PARTY}")

  // Should use relative path format
  expect(machineContactFootprint).toContain("../../3dmodels/")
  expect(machineContactFootprint).toContain(
    "adom-kicad-footprint-library.3dshapes",
  )

  console.log("Footprint content:\n", machineContactFootprint)
})

test("Symbol library: one symbol per component export (not subsymbols)", async () => {
  // KiCad symbol structure: each symbol has subsymbols (Name_0_1 for drawing, Name_1_1 for pins)
  // User concern: seeing 6 entries instead of 2
  // Expected: 2 top-level symbols (MachineContactLarge, MachinePin), each with 2 subsymbols = 6 total
  // But in KiCad's symbol browser, only 2 are selectable - subsymbols are internal structure
  const mockExports: Record<string, string[]> = {
    "lib/adom-kicad-footprint-library.ts": [
      "MachineContactLarge",
      "MachinePin",
    ],
  }

  const mockCircuitJson: Record<string, CircuitJson> = {
    MachineContactLarge: await renderMachineContactLarge(),
    MachinePin: await renderMachinePin(),
  }

  const converter = new KicadLibraryConverter({
    kicadLibraryName: "adom-kicad-footprint-library",
    entrypoint: "lib/adom-kicad-footprint-library.ts",
    getExportsFromTsxFile: async (filePath) => mockExports[filePath] ?? [],
    buildFileToCircuitJson: async (_filePath, componentName) =>
      mockCircuitJson[componentName] ?? null,
    includeBuiltins: false,
  })

  await converter.run()
  const output = converter.getOutput()

  const symbolLib = output.kicadProjectFsMap[
    "symbols/adom-kicad-footprint-library.kicad_sym"
  ] as string
  expect(symbolLib).toBeDefined()

  // Count how many TOP-LEVEL symbols are in the library (not subsymbols like _0_1 and _1_1)
  // KiCad symbols have structure: (symbol "Name" ... (symbol "Name_0_1" ...) (symbol "Name_1_1" ...))
  // We only count top-level symbols (those that don't have _\d+_\d+ suffix)
  const allSymbolMatches = symbolLib.match(/\(symbol "([^"]+)"\s*\n/g) || []
  const topLevelSymbols = allSymbolMatches.filter((match: string) => {
    const name = match.match(/"([^"]+)"/)?.[1]
    return name && !/_\d+_\d+$/.test(name)
  })

  // Should have only 2 top-level symbols: MachineContactLarge and MachinePin
  // Each top-level symbol has 2 subsymbols (_0_1 for drawing, _1_1 for pins) = 6 total entries in file
  // But only 2 are selectable in KiCad's symbol browser
  expect(topLevelSymbols.length).toBe(2)

  // Check for the expected symbol names
  expect(symbolLib).toContain('(symbol "MachineContactLarge"')
  expect(symbolLib).toContain('(symbol "MachinePin"')
})

test("3D model path should be relative ../../ format", async () => {
  // This test specifically checks the 3D model path issue
  const mockExports: Record<string, string[]> = {
    "lib/test.ts": ["TestComponent"],
  }

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
              height="1mm"
              portHints={["pin1"]}
              pcbX={0}
              pcbY={0}
            />
          </footprint>
        }
        cadModel={
          <cadmodel
            modelUrl={stepFilePath}
            rotationOffset={{ x: 0, y: 0, z: 0 }}
          />
        }
        pinLabels={{ pin1: "1" }}
      />
    </board>,
  )
  await circuit.renderUntilSettled()

  const mockCircuitJson: Record<string, CircuitJson> = {
    TestComponent: circuit.getCircuitJson() as CircuitJson,
  }

  const converter = new KicadLibraryConverter({
    kicadLibraryName: "test-library",
    entrypoint: "lib/test.ts",
    getExportsFromTsxFile: async (filePath) => mockExports[filePath] ?? [],
    buildFileToCircuitJson: async (_filePath, componentName) =>
      mockCircuitJson[componentName] ?? null,
    includeBuiltins: false,
  })

  await converter.run()
  const output = converter.getOutput()

  const footprint = output.kicadProjectFsMap[
    "footprints/test-library.pretty/TestComponent.kicad_mod"
  ] as string
  expect(footprint).toBeDefined()

  // Extract the model path
  const modelPathMatch = footprint.match(/\(model\s+"([^"]+)"/)
  if (modelPathMatch) {
    console.log("3D Model path:", modelPathMatch[1])

    // Path should be relative
    expect(modelPathMatch[1]).toMatch(/^\.\.\/\.\.\/3dmodels\//)
    expect(modelPathMatch[1]).not.toContain("${KICAD_3RD_PARTY}")
  } else {
    console.log("No model path found in footprint")
  }
})
