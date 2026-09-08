import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import {
  CircuitJsonToKicadPcbConverter,
  KicadLibraryConverter,
  resolveAndLoadKicad3dModelFiles,
} from "lib"

test("model references and saved filenames agree for URL suffixes containing separators", async () => {
  for (const sourceUrl of [
    "https://example.com/models/switch.step#preview",
    "https://example.com/models/switch.step#view/front",
    "https://example.com/models/switch.step?redirect=/view/front",
    "https://example.com/models/switch.step?key=a\\b",
    "https://example.com/models/switch.step",
  ]) {
    const circuit = new Circuit()
    circuit.add(
      <board width={20} height={20}>
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
    const footprint = Object.entries(libraryOutput.kicadProjectFsMap).find(
      ([path]) => path.endsWith("Switch.kicad_mod"),
    )?.[1] as string
    for (const [sources, content, prefix] of [
      [pcb.getModel3dSourcePaths(), pcb.getOutputString(), "${KIPRJMOD}/"],
      [libraryOutput.model3dSourcePaths, footprint, "../../"],
    ] as const) {
      const paths: string[] = []
      await resolveAndLoadKicad3dModelFiles({
        projectName: "test_lib",
        model3dSourcePaths: sources,
        fetch: async () => ({
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(1),
        }),
        onModelFile: ({ outputPath }) => {
          paths.push(outputPath)
        },
      })
      expect(paths).toEqual(["3dmodels/test_lib.3dshapes/switch.step"])
      expect(content).toContain(`"${prefix}${paths[0]}"`)
    }
  }
})
