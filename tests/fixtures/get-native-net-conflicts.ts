import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { CircuitJson } from "circuit-json"
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadSchConverter,
} from "lib"

/** Let KiCad compare both exports, rather than comparing converter objects. */
export async function getNativeNetParity(circuitJson: CircuitJson) {
  const directory = await mkdtemp(join(tmpdir(), "kicad-net-parity-"))
  try {
    const schematic = new CircuitJsonToKicadSchConverter(circuitJson)
    schematic.runUntilFinished()
    for (const file of schematic.getOutputFiles({
      schematicFilename: "board.kicad_sch",
    })) {
      await writeFile(join(directory, file.filename), file.content)
    }
    const pcb = new CircuitJsonToKicadPcbConverter(circuitJson)
    pcb.runUntilFinished()
    const pcbPath = join(directory, "board.kicad_pcb")
    const reportPath = join(directory, "drc.json")
    await writeFile(pcbPath, pcb.getOutputString())
    const process = Bun.spawn(
      [
        "kicad-cli",
        "pcb",
        "drc",
        "--schematic-parity",
        "--format",
        "json",
        "-o",
        reportPath,
        pcbPath,
      ],
      { stdout: "pipe", stderr: "pipe" },
    )
    const [exitCode, stdout, stderr] = await Promise.all([
      process.exited,
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
    ])
    if (exitCode !== 0)
      throw new Error(`KiCad DRC failed (${exitCode}): ${stderr}\n${stdout}`)
    const report = await Bun.file(reportPath).json()
    if (!Array.isArray(report.schematic_parity))
      throw new Error("KiCad did not produce a schematic parity report")
    const netlistPath = join(directory, "netlist.xml")
    const netlistProcess = Bun.spawn(
      [
        "kicad-cli",
        "sch",
        "export",
        "netlist",
        "--format",
        "kicadxml",
        "-o",
        netlistPath,
        join(directory, "board.kicad_sch"),
      ],
      { stdout: "pipe", stderr: "pipe" },
    )
    const [netlistExit, netlistOutput, netlistError] = await Promise.all([
      netlistProcess.exited,
      new Response(netlistProcess.stdout).text(),
      new Response(netlistProcess.stderr).text(),
    ])
    if (netlistExit !== 0)
      throw new Error(
        `KiCad netlist failed (${netlistExit}): ${netlistError}\n${netlistOutput}`,
      )
    const xml = await readFile(netlistPath, "utf8")
    const nets = [
      ...xml.matchAll(/<net\b[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/net>/g),
    ].map(([, name, body]) => ({
      name,
      pins: [...body!.matchAll(/<node\b[^>]*ref="([^"]*)"[^>]*pin="([^"]*)"/g)]
        .map(([, ref, pin]) => `${ref}.${pin}`)
        .sort(),
    }))
    return {
      conflicts: report.schematic_parity.filter(
        (violation: { type: string }) => violation.type === "net_conflict",
      ),
      nets,
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

export async function getNativeNetConflicts(circuitJson: CircuitJson) {
  return (await getNativeNetParity(circuitJson)).conflicts
}
