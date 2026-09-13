import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { parseKicadMod } from "kicadts"
import {
  CircuitJsonToKicadPcbConverter,
  KicadLibraryConverter,
  resolveAndLoadKicad3dModelFiles,
} from "lib"
import { resolveKicad3dModelPaths } from "lib/utils/resolveKicad3dModelPaths"

async function renderModels(urls: string[]) {
  const circuit = new Circuit()
  circuit.add(
    <board width={40} height={20}>
      {urls.map((url, index) => (
        <chip
          key={index}
          name={`U${index + 1}`}
          pcbX={index * 8 - 8}
          footprint="tssop8"
          cadModel={{ stepUrl: url }}
        />
      ))}
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson()
}

async function loadModels(sources: string[]) {
  const files = new Map<string, string>()
  await resolveAndLoadKicad3dModelFiles({
    projectName: "example",
    model3dSourcePaths: sources,
    fetch: async (url) => ({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode(url).buffer,
    }),
    onModelFile: ({ outputPath, content }) => {
      files.set(outputPath, new TextDecoder().decode(content))
    },
  })
  expect(files.size).toBe(new Set(sources).size)
  return files
}

test("distinct model sources keep matching references and files across PCB and library packaging", async () => {
  for (const urls of [
    [
      "https://example.com/left/body.step",
      "https://example.com/right/body.step",
      "https://example.com/body-1.step",
    ],
    [
      "https://example.com/body.step?part=left",
      "https://example.com/body.step?part=right",
    ],
    ["https://example.com/body.step", "https://example.com/body.step"],
  ]) {
    const input = await renderModels(urls)
    const pcb = new CircuitJsonToKicadPcbConverter(input, {
      includeBuiltin3dModels: true,
      projectName: "example",
    })
    pcb.runUntilFinished()
    expect(pcb.getModel3dSourcePaths()).toEqual([...new Set(urls)])
    const files = await loadModels(pcb.getModel3dSourcePaths())
    for (const [index, footprint] of pcb.getOutput().footprints.entries()) {
      const path = footprint.models[0]!.path.replace("${KIPRJMOD}/", "")
      expect(files.get(path)).toBe(urls[index])
    }
    const paths = resolveKicad3dModelPaths(urls, "example")
    const reversed = resolveKicad3dModelPaths([...urls].reverse(), "example")
    for (const url of urls) expect(paths.get(url)).toBe(reversed.get(url))
    const reservedSource = urls.find((url) => url.endsWith("body-1.step"))
    if (reservedSource)
      expect(paths.get(reservedSource)).toBe(
        "3dmodels/example.3dshapes/body-1.step",
      )

    const circuits = await Promise.all(urls.map((url) => renderModels([url])))
    const names = urls.map((_, index) => `Part${index}`)
    for (const isPcm of [false, true]) {
      const library = new KicadLibraryConverter({
        kicadLibraryName: "example",
        entrypoint: "lib/example.ts",
        getExportsFromTsxFile: async () => names,
        buildFileToCircuitJson: async (_, name) =>
          circuits[names.indexOf(name)]!,
        includeBuiltins: true,
        isPcm,
        kicadPcmPackageId: "com.example.parts",
      })
      await library.run()
      const output = library.getOutput()
      const libraryFiles = await loadModels(output.model3dSourcePaths)
      for (const [index, name] of names.entries()) {
        const text = output.kicadProjectFsMap[
          `footprints/example.pretty/${name}.kicad_mod`
        ] as string
        const model = parseKicadMod(text).models[0]!
        const path = model.path
          .replace("../../", "")
          .replace(
            "${KICAD_3RD_PARTY}/3dmodels/com.example.parts/",
            "3dmodels/",
          )
        expect(libraryFiles.get(path)).toBe(urls[index])
      }
    }
  }
})
