import { expect, test } from "bun:test"
import { $ } from "bun"
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadProConverter,
} from "lib"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createBoardDesignRulesCircuit } from "../fixtures/create-board-design-rules-circuit"

type Violation = {
  type: string
  description: string
  items: { uuid: string; description: string }[]
}

test("native KiCad DRC enforces the exported edge limit and retains other violations", async () => {
  const circuitJson = await createBoardDesignRulesCircuit(0.3)
  const pcbConverter = new CircuitJsonToKicadPcbConverter(circuitJson)
  pcbConverter.runUntilFinished()
  const pcbContent = pcbConverter.getOutputString()
  expect(pcbContent).toContain("(width 0.2)")

  const dir = await mkdtemp(join(tmpdir(), "kicad-board-rules-"))
  const reports: Violation[][] = []
  try {
    for (const edge of [0.3, 0.5]) {
      const source = circuitJson.map((element) =>
        element.type === "pcb_board"
          ? { ...element, min_board_edge_clearance: edge }
          : element,
      )
      const projectName = `edge-${edge}`
      const proConverter = new CircuitJsonToKicadProConverter(source, {
        projectName,
      })
      const pcbPath = join(dir, `${projectName}.kicad_pcb`)
      const reportPath = join(dir, `${projectName}.json`)
      // Reuse identical PCB bytes so only the project constraint changes.
      await writeFile(pcbPath, pcbContent)
      await writeFile(
        join(dir, `${projectName}.kicad_pro`),
        proConverter.getOutputString(),
      )
      const result =
        await $`kicad-cli pcb drc ${pcbPath} --format json --units mm --severity-all --exit-code-violations -o ${reportPath}`
          .nothrow()
          .quiet()
      expect(result.exitCode).toBe(5)
      const report: { violations: Violation[] } = JSON.parse(
        await readFile(reportPath, "utf8"),
      )
      reports.push(report.violations)
    }

    const explicit = reports[0]!
    const stricter = reports[1]!
    const edgeFindings = (violations: Violation[]) =>
      violations.filter(
        (violation) => violation.type === "copper_edge_clearance",
      )
    expect(edgeFindings(explicit)).toHaveLength(1)
    expect(edgeFindings(explicit)[0]!.description).toContain("0.3000 mm")
    expect(
      edgeFindings(explicit)[0]!.items.some((item) =>
        item.description.includes("TooClose"),
      ),
    ).toBe(true)
    expect(edgeFindings(stricter)).toHaveLength(2)

    // Tightening the edge constraint must not suppress a real width violation.
    expect(explicit.some((violation) => violation.type === "track_width")).toBe(
      true,
    )
    const otherFindings = (violations: Violation[]) =>
      violations
        .filter((violation) => violation.type !== "copper_edge_clearance")
        .map((violation) => ({
          type: violation.type,
          items: violation.items.map((item) => item.uuid).sort(),
        }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    expect(otherFindings(explicit)).toEqual(otherFindings(stricter))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}, 30_000)
