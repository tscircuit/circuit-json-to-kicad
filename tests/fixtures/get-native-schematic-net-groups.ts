import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

export async function getNativeSchematicNetGroups(content: string) {
  const directory = await mkdtemp(join(tmpdir(), "kicad-netlist-"))
  try {
    const schematicPath = join(directory, "fixture.kicad_sch")
    const netlistPath = join(directory, "fixture.net")
    await writeFile(schematicPath, content)
    const result = Bun.spawnSync([
      "kicad-cli",
      "sch",
      "export",
      "netlist",
      "--format",
      "kicadxml",
      "--output",
      netlistPath,
      schematicPath,
    ])
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.toString() + result.stdout.toString())
    }
    const netlist = await readFile(netlistPath, "utf8")
    return [...netlist.matchAll(/<net\b[^>]*>([\s\S]*?)<\/net>/g)].map((net) =>
      [...net[1]!.matchAll(/<node ref="([^"]+)" pin="([^"]+)"/g)]
        .map((node) => `${node[1]}.${node[2]}`)
        .sort(),
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
