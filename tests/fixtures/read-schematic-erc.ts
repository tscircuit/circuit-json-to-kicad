import { $ } from "bun"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

export async function readSchematicErc(schematic: string) {
  const directory = await mkdtemp(join(tmpdir(), "builtin-grid-"))
  try {
    const input = join(directory, "circuit.kicad_sch")
    const report = join(directory, "erc.json")
    await writeFile(input, schematic)
    await $`kicad-cli sch erc --format json --output ${report} ${input}`.quiet()
    const result: { sheets: { violations: { type: string }[] }[] } = JSON.parse(
      await readFile(report, "utf8"),
    )
    return result.sheets
      .flatMap((sheet) => sheet.violations)
      .map((violation) => violation.type)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
