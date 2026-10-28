import { beforeAll, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { CircuitJson, PcbBoard } from "circuit-json"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { CircuitJsonToKicadProConverter } from "lib/project/CircuitJsonToKicadProConverter"
import fixture from "tests/assets/nema34-board-edge-clearance.circuit.json"

const circuitJson = fixture as CircuitJson
const board = circuitJson.find((item) => item.type === "pcb_board") as PcbBoard
const project = new CircuitJsonToKicadProConverter(circuitJson, {
  projectName: "nema34",
}).getOutput()

type Violation = { type: string; description: string; severity: string }
let missingRuleErrors: Violation[]
let exportedRuleErrors: Violation[]

// Run KiCad outside test.failing so a missing executable or a failed DRC process
// cannot be mistaken for the expected converter regression.
beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), "nema34-edge-clearance-"))
  try {
    const pcb = new CircuitJsonToKicadPcbConverter(circuitJson)
    pcb.runUntilFinished()
    const pcbText = pcb.getOutputString()

    const runDrc = async (name: string, pro: typeof project) => {
      const stem = join(directory, name)
      // The control and actual export use byte-identical copper and outline.
      await writeFile(`${stem}.kicad_pcb`, pcbText)
      await writeFile(`${stem}.kicad_pro`, JSON.stringify(pro))
      const process = Bun.spawn(
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
        process.exited,
        new Response(process.stdout).text(),
        new Response(process.stderr).text(),
      ])
      if (exitCode !== 0) {
        throw new Error(`KiCad DRC failed (${exitCode}): ${stdout}\n${stderr}`)
      }
      const report = JSON.parse(await readFile(`${stem}.json`, "utf8")) as {
        violations: Violation[]
      }
      const artifact = `debug-output/nema34-board-edge-clearance/${name}`
      await Bun.write(`${artifact}.kicad_pcb`, pcbText)
      await Bun.write(`${artifact}.kicad_pro`, JSON.stringify(pro, null, 2))
      await Bun.write(`${artifact}.drc.json`, JSON.stringify(report, null, 2))
      return report.violations.filter(
        (item) => item.type === "copper_edge_clearance",
      )
    }

    const missingRule = structuredClone(project)
    delete missingRule.board.design_settings.rules.min_copper_edge_clearance
    missingRuleErrors = await runDrc("missing-rule", missingRule)
    exportedRuleErrors = await runDrc("exported-rule", project)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)

test("the real NEMA34 fixture requests 0.20 mm global edge clearance", () => {
  expect(board.pcb_board_id).toBe("pcb_board_0")
  expect(board.min_board_edge_clearance).toBe(0.2)
  expect(board.min_trace_width).toBe(0.15)
  expect(circuitJson).toHaveLength(4)
})

test("preserves the real NEMA34 board's global edge clearance", () => {
  expect(project.board.design_settings.rules).toMatchObject({
    min_copper_edge_clearance: 0.2,
    min_track_width: 0.15,
  })
})

test("KiCad's missing-rule control reports the unintended 0.50 mm limit", () => {
  expect(missingRuleErrors.length).toBeGreaterThan(0)
  expect(
    missingRuleErrors.some((item) => item.description.includes("0.5000 mm")),
  ).toBe(true)
})

test("the actual exported project has no false copper-edge errors", () => {
  expect(exportedRuleErrors).toEqual([])
})

test.each([0, 0.35])("preserves an explicit %s mm edge clearance", (value) => {
  const input = structuredClone(circuitJson)
  const board = input.find((item) => item.type === "pcb_board") as PcbBoard
  board.min_board_edge_clearance = value
  const project = new CircuitJsonToKicadProConverter(input).getOutput()
  expect(project.board.design_settings.rules).toHaveProperty(
    "min_copper_edge_clearance",
    value,
  )
})

test("leaves an unspecified edge clearance to KiCad", () => {
  const input = structuredClone(circuitJson)
  const board = input.find((item) => item.type === "pcb_board") as PcbBoard
  delete board.min_board_edge_clearance
  for (const data of [input, [] as CircuitJson]) {
    const project = new CircuitJsonToKicadProConverter(data).getOutput()
    expect(project.board.design_settings.rules).not.toHaveProperty(
      "min_copper_edge_clearance",
    )
  }
})
