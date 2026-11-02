import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { $ } from "bun"

// IPC-2581 is exported after KiCad loads the PCB, so duplicate names have
// already been merged. Parsing the converter's objects alone misses this bug.
export async function exportNativePcbNets(kicadPcb: string) {
  const directory = await mkdtemp(join(tmpdir(), "pcb-net-isolation-"))
  try {
    const pcbPath = join(directory, "panel.kicad_pcb")
    const ipcPath = join(directory, "panel.xml")
    await writeFile(pcbPath, kicadPcb)
    await $`kicad-cli pcb export ipc2581 --output ${ipcPath} ${pcbPath}`.quiet()
    const xml = await readFile(ipcPath, "utf8")
    return [...xml.matchAll(/<Set\b[^>]*net="([^"]+)"[^>]*>([\s\S]*?)<\/Set>/g)]
      .map(([, name, body]) => ({
        name,
        pins: [
          ...body!.matchAll(
            /<PinRef componentRef="([^"]*)" pin="([^"]*)"\s*\/>/g,
          ),
        ]
          .map(([, reference, pin]) => `${reference}.${pin}`)
          .sort(),
      }))
      .filter((net) => net.pins.length > 0)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
