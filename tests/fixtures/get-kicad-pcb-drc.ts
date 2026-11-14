import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { $ } from "bun"

export const getKicadPcbDrc = async (kicadPcb: string) => {
  const directory = await mkdtemp(join(tmpdir(), "kicad-pcb-drc-"))
  try {
    const pcbPath = join(directory, "board.kicad_pcb")
    const reportPath = join(directory, "drc.json")
    await writeFile(pcbPath, kicadPcb)
    await $`kicad-cli pcb drc --format json --output ${reportPath} ${pcbPath}`.quiet()
    return JSON.parse(await readFile(reportPath, "utf8")) as {
      violations: { type: string; description: string }[]
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
