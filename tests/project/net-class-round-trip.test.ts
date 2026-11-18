import { expect, test } from "bun:test"
import "bun-match-svg"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { any_circuit_element, type CircuitJson } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadProConverter,
} from "lib"
import { circuitJson, netSettings } from "./fixtures/imported-kicad-settings"

function exportFiles(input: CircuitJson) {
  const pcb = new CircuitJsonToKicadPcbConverter(input)
  pcb.runUntilFinished()
  return {
    pcb: pcb.getOutputString(),
    project: new CircuitJsonToKicadProConverter(input).getOutputString(),
  }
}

function importFiles(files: ReturnType<typeof exportFiles>) {
  const importer = new KicadToCircuitJsonConverter()
  importer.addFile("classes.kicad_pcb", files.pcb)
  importer.addFile("classes.kicad_pro", files.project)
  importer.runUntilFinished()
  return JSON.parse(JSON.stringify(importer.getOutput())).map(
    (element: unknown) => any_circuit_element.parse(element),
  ) as CircuitJson
}

test("KiCad files survive import, schema parsing, export and a second import", async () => {
  const first = importFiles(exportFiles(circuitJson))
  const second = importFiles(exportFiles(first))
  for (const imported of [first, second]) {
    expect(
      imported.find((element) => element.type === "source_project_metadata")
        ?.metadata?.kicad_project?.net_settings,
    ).toEqual(netSettings)
    expect(
      imported
        .filter((element) => element.type === "source_net")
        .map((net) => ({
          name: net.metadata?.kicad_net?.name,
          width: net.trace_width,
        }))
        .sort((a, b) => a.name!.localeCompare(b.name!)),
    ).toEqual([
      { name: "/POWER/VCC+", width: 0.8 },
      { name: "SENSE[0]", width: 0.8 },
    ])
  }
  await expect(convertCircuitJsonToPcbSvg(second)).toMatchSvgSnapshot(
    import.meta.path,
    "round-trip",
  )
})

test.skipIf(!Bun.which("kicad-cli"))(
  "KiCad loads retained assignments using the original net names",
  async () => {
    const exported = exportFiles(importFiles(exportFiles(circuitJson)))
    const directory = await mkdtemp(
      join(tmpdir(), "kicad-metadata-round-trip-"),
    )
    try {
      const pcbPath = join(directory, "classes.kicad_pcb")
      const reportPath = join(directory, "report.json")
      await writeFile(pcbPath, exported.pcb)
      await writeFile(join(directory, "classes.kicad_pro"), exported.project)
      const probes = [
        ["VCC", "/POWER/VCC+", "Power"],
        ["VCC", "/POWER/VCC+", "Inherited"],
        ["SENSE", "SENSE[0]", "Sense"],
        ["VCC", "/POWER/VCC+", "Sense"],
        ["SENSE", "SENSE[0]", "Power"],
      ]
      await writeFile(
        join(directory, "classes.kicad_dru"),
        `(version 1)\n${probes.map(([label, net, netClass]) => `(rule "probe_${label}_${netClass}" (condition "A.Type == 'Track' && A.NetName == '${net}' && A.hasNetclass('${netClass}')") (constraint assertion "A.hasNetclass('NO_SUCH_CLASS')"))`).join("\n")}`,
      )
      const result = Bun.spawnSync([
        "kicad-cli",
        "pcb",
        "drc",
        "--format",
        "json",
        "--severity-all",
        "--output",
        reportPath,
        pcbPath,
      ])
      expect(result.exitCode).toBe(0)
      const report = JSON.parse(await Bun.file(reportPath).text()) as {
        violations: Array<{ type: string; description: string }>
      }
      const actual = Array.from(
        new Set(
          report.violations
            .filter((violation) => violation.type === "assertion_failure")
            .map((violation) => /probe_(\w+)/.exec(violation.description)?.[1]),
        ),
      ).sort()
      expect(actual).toEqual(["SENSE_Sense", "VCC_Inherited", "VCC_Power"])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
)
