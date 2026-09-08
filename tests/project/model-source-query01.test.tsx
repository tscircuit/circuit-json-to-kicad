import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import {
  CircuitJsonToKicadPcbConverter,
  KicadLibraryConverter,
  resolveAndLoadKicad3dModelFiles,
} from "lib"

test("PCB and library model downloads preserve required URL query parameters", async () => {
  const sourceUrl =
    "https://example.com/models/switch.step?part=SW1&signature=a%2Bb%2Fc%3D&expires=123"
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <chip name="U1" footprint="tssop8" cadModel={{ stepUrl: sourceUrl }} />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const pcb = new CircuitJsonToKicadPcbConverter(circuitJson, {
    includeBuiltin3dModels: true,
    projectName: "test_lib",
  })
  pcb.runUntilFinished()
  const library = new KicadLibraryConverter({
    kicadLibraryName: "test_lib",
    entrypoint: "lib/test_lib.ts",
    getExportsFromTsxFile: async () => ["Switch"],
    buildFileToCircuitJson: async () => circuitJson,
    includeBuiltins: true,
  })
  await library.run()
  const libraryOutput = library.getOutput()

  for (const sources of [
    pcb.getModel3dSourcePaths(),
    libraryOutput.model3dSourcePaths,
  ]) {
    const fetched: string[] = []
    const loaded: Array<{ outputPath: string; content: Uint8Array }> = []
    await resolveAndLoadKicad3dModelFiles({
      projectName: "test_lib",
      model3dSourcePaths: sources,
      fetch: async (url) => {
        fetched.push(url)
        return {
          ok: url === sourceUrl,
          arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        }
      },
      onModelFile: (file) => {
        loaded.push(file)
      },
    })
    expect(fetched).toEqual([sourceUrl])
    expect(loaded).toHaveLength(1)
    expect(loaded[0]!.outputPath).toBe("3dmodels/test_lib.3dshapes/switch.step")
    expect(loaded[0]!.content).toEqual(new Uint8Array([1, 2, 3]))
  }
  expect(pcb.getOutputString()).toContain(
    "${KIPRJMOD}/3dmodels/test_lib.3dshapes/switch.step",
  )
  const footprint = Object.entries(libraryOutput.kicadProjectFsMap).find(
    ([path]) => path.endsWith("Switch.kicad_mod"),
  )?.[1] as string
  expect(footprint).toContain("../../3dmodels/test_lib.3dshapes/switch.step")
  expect(footprint).not.toContain("signature=")
})
