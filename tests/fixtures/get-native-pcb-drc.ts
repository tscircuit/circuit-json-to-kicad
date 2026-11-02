import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { $ } from "bun"

export async function getNativePcbDrc(kicadPcb: string) {
  const directory = await mkdtemp(join(tmpdir(), "panel-outline-drc-"))
  try {
    const pcbPath = join(directory, "panel.kicad_pcb")
    const reportPath = join(directory, "drc.json")
    await writeFile(pcbPath, kicadPcb)
    await $`kicad-cli pcb drc --format json --output ${reportPath} ${pcbPath}`.quiet()
    const report: { violations: { type: string; description: string }[] } =
      JSON.parse(await readFile(reportPath, "utf8"))
    return report
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
