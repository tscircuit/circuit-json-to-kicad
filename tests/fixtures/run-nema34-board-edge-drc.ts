import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import type { CircuitJsonToKicadProConverter } from "lib/project/CircuitJsonToKicadProConverter"
import fixture from "tests/assets/nema34-board-edge-clearance.circuit.json"

type Violation = { type: string; description: string; severity: string }

export async function runNema34BoardEdgeDrc(
  project: ReturnType<CircuitJsonToKicadProConverter["getOutput"]>,
  artifactName: string,
): Promise<Violation[]> {
  const directory = await mkdtemp(join(tmpdir(), "nema34-edge-clearance-"))
  try {
    const circuitJson = fixture as CircuitJson
    const pcbConverter = new CircuitJsonToKicadPcbConverter(circuitJson)
    pcbConverter.runUntilFinished()
    const pcbText = pcbConverter.getOutputString()
    const stem = join(directory, artifactName)
    // Each control/export invocation uses the same fixture and PCB converter.
    await writeFile(`${stem}.kicad_pcb`, pcbText)
    await writeFile(`${stem}.kicad_pro`, JSON.stringify(project))
    const drcProcess = Bun.spawn(
      [
        Bun.env.KICAD_CLI ?? "kicad-cli",
        "pcb",
        "drc",
        "--refill-zones",
        "--all-track-errors",
        "--format",
        "json",
        "--output",
        `${stem}.json`,
        `${stem}.kicad_pcb`,
      ],
      { stdout: "pipe", stderr: "pipe" },
    )
    const [exitCode, stdout, stderr] = await Promise.all([
      drcProcess.exited,
      new Response(drcProcess.stdout).text(),
      new Response(drcProcess.stderr).text(),
    ])
    if (exitCode !== 0) {
      throw new Error(`KiCad DRC failed (${exitCode}): ${stdout}\n${stderr}`)
    }
    const report = JSON.parse(await readFile(`${stem}.json`, "utf8")) as {
      violations: Violation[]
    }
    const artifact = `debug-output/nema34-board-edge-clearance/${artifactName}`
    await Bun.write(`${artifact}.kicad_pcb`, pcbText)
    await Bun.write(`${artifact}.kicad_pro`, JSON.stringify(project, null, 2))
    await Bun.write(`${artifact}.drc.json`, JSON.stringify(report, null, 2))
    return report.violations.filter(
      (violation) => violation.type === "copper_edge_clearance",
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
