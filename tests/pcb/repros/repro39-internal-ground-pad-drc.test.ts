import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { $ } from "bun"
import type { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { createInternalGroundPadRepro } from "../../fixtures/internal-ground-pad-repro"

async function runDrc({
  directory,
  kicadPcb,
}: {
  directory: string
  kicadPcb: KicadPcb
}) {
  const boardPath = join(directory, "board.kicad_pcb")
  const reportPath = join(directory, "drc.json")
  await writeFile(boardPath, kicadPcb.getString())
  await $`kicad-cli pcb drc ${boardPath} --format json --output ${reportPath}`.quiet()
  return JSON.parse(await readFile(reportPath, "utf8"))
}

test("KiCad recognizes separated sections of an internally connected pad as connected", async () => {
  const converter = new CircuitJsonToKicadPcbConverter(
    await createInternalGroundPadRepro(),
  )
  converter.runUntilFinished()
  const kicadPcb = converter.getOutput()
  const directory = await mkdtemp(join(tmpdir(), "internal-ground-pad-drc-"))
  try {
    const fixed = await runDrc({ directory, kicadPcb })
    expect(fixed.unconnected_items).toHaveLength(0)
    expect(
      fixed.violations.filter(
        (violation: { type: string }) => violation.type === "shorting_items",
      ),
    ).toHaveLength(0)

    // Net assignment alone is insufficient: removing the internal jumper flag
    // must restore KiCad's eight false missing connections.
    kicadPcb.footprints[0]!.duplicatePadNumbersAreJumpers = undefined
    const withoutInternalConnection = await runDrc({ directory, kicadPcb })
    expect(withoutInternalConnection.unconnected_items).toHaveLength(8)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 180_000)
