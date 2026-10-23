import { $ } from "bun"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadSchConverter } from "lib"
import type { CircuitJsonToKicadSchConverterOptions } from "lib/schematic/CircuitJsonToKicadSchConverter"

// Ask KiCad which pins are connected, independently of the converter's objects.
export async function exportNativeSchematicNets(
  circuit: CircuitJson,
  options?: CircuitJsonToKicadSchConverterOptions,
) {
  const converter = new CircuitJsonToKicadSchConverter(circuit, options)
  converter.runUntilFinished()
  const files = converter.getOutputFiles({
    schematicFilename: "root.kicad_sch",
  })
  const directory = await mkdtemp(join(tmpdir(), "inline-net-labels-"))

  try {
    for (const file of files) {
      await writeFile(join(directory, file.filename), file.content)
    }
    const schematicPath = join(directory, "root.kicad_sch")
    const netlistPath = join(directory, "netlist.xml")
    await $`kicad-cli sch export netlist --format kicadxml -o ${netlistPath} ${schematicPath}`.quiet()
    const xml = await readFile(netlistPath, "utf8")

    // The test fixtures use simple ASCII net names and reference designators.
    return [
      ...xml.matchAll(/<net\b[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/net>/g),
    ].map(([, name, body]) => ({
      name,
      pins: [
        ...body!.matchAll(
          /<node\b[^>]*ref="([^"]*)"[^>]*pin="([^"]*)"[^>]*\/>/g,
        ),
      ]
        .map(([, reference, pin]) => `${reference}.${pin}`)
        .sort(),
    }))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
