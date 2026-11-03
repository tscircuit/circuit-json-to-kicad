import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { $ } from "bun"

export const runKicadPcbDrc = async (
  kicadFileContent: string,
): Promise<{ unconnected_items: unknown[] }> => {
  const tempDir = await mkdtemp(join(tmpdir(), "kicad-pcb-drc-"))
  try {
    const pcbPath = join(tempDir, "board.kicad_pcb")
    const reportPath = join(tempDir, "drc.json")
    await writeFile(pcbPath, kicadFileContent)
    await $`kicad-cli pcb drc ${pcbPath} --format json -o ${reportPath}`.quiet()
    return JSON.parse(await readFile(reportPath, "utf8"))
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}
