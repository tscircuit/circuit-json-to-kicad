import { $ } from "bun"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { KicadSchFile } from "lib/schematic/CircuitJsonToKicadSchConverter"

/** Use KiCad's electrical interpretation, rather than inferring nets from labels. */
export async function exportSchematicNetlist(files: KicadSchFile[]) {
  const dir = await mkdtemp(join(tmpdir(), "inline-label-netlist-"))
  try {
    for (const file of files)
      await writeFile(join(dir, file.filename), file.content)
    const output = join(dir, "netlist.xml")
    await $`kicad-cli sch export netlist --format kicadxml -o ${output} ${join(dir, files[0]!.filename)}`.quiet()
    const xml = await readFile(output, "utf8")
    return [
      ...xml.matchAll(/<net\b[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/net>/g),
    ].map((match) => ({
      name: match[1]!,
      pins: [
        ...match[2]!.matchAll(/<node\b[^>]*ref="([^"]*)"[^>]*pin="([^"]*)"/g),
      ]
        .map((node) => `${node[1]}.${node[2]}`)
        .sort(),
    }))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
