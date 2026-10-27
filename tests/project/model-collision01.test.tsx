import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import {
  CircuitJsonToKicadPcbConverter,
  resolveAndLoadKicad3dModelFiles,
} from "lib"

test("different model sources with the same basename remain distinct when packaged", async () => {
  const urls = [
    "https://example.com/left/body.step",
    "https://example.com/right/body.step",
  ]
  const circuit = new Circuit()
  circuit.add(
    <board width={30} height={20}>
      <chip
        name="U1"
        pcbX={-5}
        footprint="tssop8"
        cadModel={{ stepUrl: urls[0]! }}
      />
      <chip
        name="U2"
        pcbX={5}
        footprint="tssop8"
        cadModel={{ stepUrl: urls[1]! }}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadPcbConverter(
    circuit.getCircuitJson(),
    { includeBuiltin3dModels: true, projectName: "example" },
  )
  converter.runUntilFinished()
  expect(converter.getModel3dSourcePaths()).toEqual(urls)
  const writes: Array<{ source: string; path: string }> = []
  const files = new Map<string, Uint8Array>()
  await resolveAndLoadKicad3dModelFiles({
    projectName: "example",
    model3dSourcePaths: converter.getModel3dSourcePaths(),
    fetch: async (url) => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([urls.indexOf(url) + 1]).buffer,
    }),
    onModelFile: ({ sourcePath, outputPath, content }) => {
      writes.push({ source: sourcePath, path: outputPath })
      files.set(outputPath, content)
    },
  })
  expect(writes.map((write) => write.source)).toEqual(urls)
  expect(files.size).toBe(2)
  const models = converter
    .getOutput()
    .footprints.flatMap((fp) => fp.models.map((model) => model.path))
  expect(new Set(models).size).toBe(2)
  expect(models).toEqual(writes.map((write) => `\${KIPRJMOD}/${write.path}`))
})
