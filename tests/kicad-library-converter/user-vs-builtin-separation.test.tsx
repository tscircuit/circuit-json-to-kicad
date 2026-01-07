import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { KicadLibraryConverter } from "lib/kicad-library/KicadLibraryConverter"

test("KicadLibraryConverter separates user footprints from builtin footprints", async () => {
  const mockCircuitJsons: Record<string, any> = {}

  // Create a component that uses a standard resistor footprint internally
  const keyWithResistor = new Circuit()
  keyWithResistor.add(
    <board width="30mm" height="30mm">
      <chip
        name="KeyWithLED"
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
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={5} pcbY={0} />
    </board>,
  )
  await keyWithResistor.renderUntilSettled()
  mockCircuitJsons["lib/components/KeyWithLED.tsx"] =
    keyWithResistor.getCircuitJson()

  const converter = new KicadLibraryConverter({
    libraryName: "my-library",
    filePaths: ["lib/index.ts"],
    buildFileToCircuitJson: async (filePath: string) => {
      return mockCircuitJsons[filePath] ?? []
    },
    getExportsFromTsxFile: async () => {
      return ["KeyWithLED"]
    },
    resolveExportPath: async (entrypoint: string, exportName: string) => {
      if (exportName === "KeyWithLED") return "lib/components/KeyWithLED.tsx"
      return null
    },
  })

  await converter.run()
  const output = converter.getOutput()

  const allFiles = Object.keys(output.kicadProjectFsMap)

  // User footprint should be in my-library.pretty
  const userFootprints = allFiles.filter((p) => p.includes("my-library.pretty"))
  expect(userFootprints.some((p) => p.includes("KeyWithLED"))).toBe(true)

  // Builtin footprint (resistor_0402) should be in tscircuit_builtin.pretty
  const builtinFootprints = allFiles.filter((p) =>
    p.includes("tscircuit_builtin.pretty"),
  )
  expect(builtinFootprints.length).toBe(1)
})
